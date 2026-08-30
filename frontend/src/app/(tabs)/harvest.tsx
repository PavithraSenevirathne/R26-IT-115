import React, { useState, useEffect, useMemo } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Image, ActivityIndicator, Alert, Pressable, LayoutAnimation, Platform, UIManager } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { imageToTensor } from '../../utils/tensorHelper';
import { initializeHarvestEnsemble, runHarvestInference } from '../../services/harvestEnsemble';
import { initializePlantGate, runPlantValidation } from '../../services/plantValidation';

type ReadinessClass = 'Immature' | 'Optimal' | 'Over-mature';

// 7 finer-grained levels within the 3 main classes
type SubLevel =
  | 'veryImmature'
  | 'nearlyReady'
  | 'justOptimal'
  | 'peakOptimal'
  | 'slippingOptimal'
  | 'freshOverMature'
  | 'wayOverMature';

interface HarvestAnalysisResult {
  readiness_score: number;
  std: number;
  predicted_class: ReadinessClass;
}

// enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const safeShadow = {
  elevation: 2,
  shadowColor: '#2C402E',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 6,
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const RECHECK_MONTHS_FALLBACK = 3;
const TYPICAL_CYCLE_MONTHS = 12;
const BAND_WIDTH = 2 / 3; // each of the 3 classes spans 2/3 of the 0-2 score range

const formatShort = (d: Date) => `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
const formatMonthYear = (d: Date) => `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;

type DateKind = 'today' | 'tomorrow' | 'dryingRange' | 'ongoing' | 'projection';

interface TimelineStep {
  dateKind: DateKind;
  title: string;
  desc: string;
  icon: keyof typeof Feather.glyphMap;
  isTip?: boolean;
}

interface AdviceItem {
  icon: keyof typeof Feather.glyphMap;
  text: string;
  emphasis?: 'normal' | 'urgent';
}

// maps a score to one of the 7 sub-levels based on position within its class band
function getSubLevel(score: number, predictedClass: ReadinessClass): SubLevel {
  const bandStart =
    predictedClass === 'Immature' ? 0 : predictedClass === 'Optimal' ? BAND_WIDTH : BAND_WIDTH * 2;
  const posInBand = Math.min(Math.max((score - bandStart) / BAND_WIDTH, 0), 1);

  if (predictedClass === 'Immature') {
    return posInBand < 0.5 ? 'veryImmature' : 'nearlyReady';
  }
  if (predictedClass === 'Optimal') {
    if (posInBand < 0.35) return 'justOptimal';
    if (posInBand < 0.65) return 'peakOptimal';
    return 'slippingOptimal';
  }
  return posInBand < 0.5 ? 'freshOverMature' : 'wayOverMature';
}

// card colors/icon per main class
const THEME_BY_CLASS: Record<
  ReadinessClass,
  { bg: string; border: string; text: string; chip: string; dot: string; icon: keyof typeof Feather.glyphMap }
> = {
  'Immature': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', chip: 'bg-amber-100', dot: 'bg-amber-500', icon: 'clock' },
  'Optimal': { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', chip: 'bg-emerald-100', dot: 'bg-emerald-500', icon: 'check-circle' },
  'Over-mature': { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', chip: 'bg-orange-100', dot: 'bg-orange-500', icon: 'alert-triangle' },
};

// advice + timeline copy per sub-level
// source: Ceylon Cinnamon GI Guidebook for Farmers, Vol. 01 (EDB Sri Lanka / IFC), paraphrased
const CONTENT_BY_SUBLEVEL: Record<
  SubLevel,
  {
    subtitle: string;
    advice: AdviceItem[];
    showCutGuide: boolean;
    planSteps: TimelineStep[];
  }
> = {
  veryImmature: {
    subtitle: 'Early Growth — Several Months Away',
    showCutGuide: false,
    advice: [
      { icon: 'clock', text: 'This stem is still young — it needs a good few months before peeling.' },
      { icon: 'x-circle', text: 'Peeling now would tear the bark badly and waste the stem.' },
      { icon: 'trending-up', text: 'Focus your effort on pruning and structure instead of harvest prep.' },
      { icon: 'link', text: 'Tie any leaning shoots to a stronger stem for support.' },
    ],
    planSteps: [
      { dateKind: 'today', icon: 'scissors', title: 'Prune Damaged Growth', desc: 'Remove any diseased, crowded, or broken shoots so the healthy stems get more energy.' },
      { dateKind: 'ongoing', icon: 'shield', title: 'Protect the Bark While It Forms', desc: 'Avoid any knocks or scrapes to the stem — early damage shows up as defects later.', isTip: true },
      { dateKind: 'projection', icon: 'camera', title: 'First Re-Check', desc: 'Take a new photo around this date — it\u2019s too early to check sooner than this.' },
    ],
  },
  nearlyReady: {
    subtitle: 'Getting Close — A Few Weeks Left',
    showCutGuide: false,
    advice: [
      { icon: 'eye', text: 'This stem is close, but not quite there — give it a couple more weeks.' },
      { icon: 'aperture', text: 'Watch for the bark turning a slightly duller, less green-brown shade.' },
      { icon: 'shield', text: 'Keep other stems on this plant undisturbed while this one finishes maturing.' },
    ],
    planSteps: [
      { dateKind: 'today', icon: 'eye', title: 'Mark This Stem', desc: 'Tag or note this stem so you remember to check it again soon rather than waiting the usual full cycle.' },
      { dateKind: 'ongoing', icon: 'shield', title: 'Avoid Disturbing It', desc: 'Don\u2019t prune or handle this stem heavily now — let it finish maturing undisturbed.', isTip: true },
      { dateKind: 'projection', icon: 'camera', title: 'Re-Check Readiness', desc: 'Photograph this stem again around this date — it should be close to the Optimal window by then.' },
    ],
  },
  justOptimal: {
    subtitle: 'Ready — Safe Window, No Rush',
    showCutGuide: true,
    advice: [
      { icon: 'check-circle', text: 'This stem just reached the ready window — you can harvest now or shortly after.' },
      { icon: 'clock', text: 'You have some flexibility here without losing quality.' },
      { icon: 'scissors', text: 'Use a clean, sharp peeling knife so the bark doesn\u2019t tear.' },
      { icon: 'shield', text: 'Leave one or two other mature stems uncut so the plant keeps growing.' },
    ],
    planSteps: [
      { dateKind: 'today', icon: 'check-circle', title: 'Confirm With a Slit Test', desc: 'Optionally do a quick manual bark slit test to double check before committing to cut.' },
      { dateKind: 'tomorrow', icon: 'scissors', title: 'Harvest Whenever Convenient', desc: 'Cut cleanly about 6 cm above the ground, angled slightly inward, any day within your safe window.' },
      { dateKind: 'dryingRange', icon: 'droplet', title: 'Dry Gradually', desc: 'Start in shade, then move to controlled sun, to protect the quill quality.', isTip: true },
      { dateKind: 'projection', icon: 'refresh-cw', title: 'Watch the Window Close', desc: 'If you haven\u2019t harvested by around this date, quality will start to slip — prioritize it then.' },
    ],
  },
  peakOptimal: {
    subtitle: 'Peak Window — Harvest Today',
    showCutGuide: true,
    advice: [
      { icon: 'zap', text: 'This is the ideal moment for this stem — don\u2019t delay.', emphasis: 'urgent' },
      { icon: 'scissors', text: 'Cut it today if you can, for the best yield and quality.' },
      { icon: 'compass', text: 'Cut cleanly about 6 cm above the ground, angled slightly inward.' },
      { icon: 'shield', text: 'Leave one or two other mature stems uncut so the plant keeps growing.' },
    ],
    planSteps: [
      { dateKind: 'today', icon: 'scissors', title: 'Harvest Now', desc: 'Make one clean cut, 6 cm above the ground at a slight inward angle. This is the best day to do it.' },
      { dateKind: 'tomorrow', icon: 'truck', title: 'Deliver for Processing', desc: 'Move the bark to your pre-processing center in a clean, sealed container to keep moisture in.' },
      { dateKind: 'dryingRange', icon: 'droplet', title: 'Protect the Quality Grade', desc: 'Dry slowly in shade first, then controlled sun. This stage decides your final oil content and grade.', isTip: true },
      { dateKind: 'projection', icon: 'refresh-cw', title: 'Plan the Next Cycle', desc: 'Pick the strongest new tillers from this stump to grow into your next harvest.' },
    ],
  },
  slippingOptimal: {
    subtitle: 'Still Good, But Slipping — Act Fast',
    showCutGuide: true,
    advice: [
      { icon: 'alert-circle', text: 'This stem is still within the ready window, but only for a few more days.', emphasis: 'urgent' },
      { icon: 'arrow-up-circle', text: 'Prioritize cutting this one before your other stems.' },
      { icon: 'trending-down', text: 'Waiting longer starts to cost you both yield and bark quality.' },
      { icon: 'compass', text: 'Cut about 6 cm above the ground, angled slightly inward, as soon as you can.' },
    ],
    planSteps: [
      { dateKind: 'today', icon: 'alert-circle', title: 'Move This Up Your List', desc: 'Cut this stem before others that are less time-sensitive — it\u2019s close to slipping past its window.' },
      { dateKind: 'tomorrow', icon: 'truck', title: 'Deliver Promptly', desc: 'Get the bark to processing quickly once cut — don\u2019t let it sit.' },
      { dateKind: 'dryingRange', icon: 'droplet', title: 'Dry Without Delay', desc: 'Begin drying immediately after delivery to lock in whatever quality remains.', isTip: true },
      { dateKind: 'projection', icon: 'refresh-cw', title: 'Check Remaining Days', desc: 'If not harvested by around this date, treat it as over-mature and adjust your plan.' },
    ],
  },
  freshOverMature: {
    subtitle: 'Just Past Optimal — Harvest Soon',
    showCutGuide: true,
    advice: [
      { icon: 'alert-triangle', text: 'You\u2019ve missed the peak slightly, but the bark is still usable.' },
      { icon: 'clock', text: 'Harvest within the next few days to limit further quality loss.' },
      { icon: 'scissors', text: 'Keep your knife extra sharp — the bark may be a bit tougher now.' },
      { icon: 'shield', text: 'Still leave one or two other mature stems uncut.' },
    ],
    planSteps: [
      { dateKind: 'today', icon: 'alert-triangle', title: 'Schedule Harvest This Week', desc: 'Fit this stem into your rotation within the next few days rather than delaying further.' },
      { dateKind: 'tomorrow', icon: 'truck', title: 'Deliver for Processing', desc: 'Move the cut bark to your pre-processing center promptly — quality drops faster from here.' },
      { dateKind: 'dryingRange', icon: 'droplet', title: 'Watch Moisture Closely', desc: 'Slightly over-mature bark can hold more moisture — dry a little longer to avoid mold.', isTip: true },
      { dateKind: 'projection', icon: 'refresh-cw', title: 'Note the Delay', desc: 'Record this timing so you can harvest earlier next cycle from this stump.' },
    ],
  },
  wayOverMature: {
    subtitle: 'Long Overdue — Harvest Immediately',
    showCutGuide: true,
    advice: [
      { icon: 'alert-triangle', text: 'This stem is well past its window — quality is actively dropping.', emphasis: 'urgent' },
      { icon: 'zap', text: 'Cut it immediately, ahead of everything else in your rotation.', emphasis: 'urgent' },
      { icon: 'scissors', text: 'Expect tougher bark; keep an especially sharp knife for a clean cut.' },
      { icon: 'refresh-cw', text: 'Choose the strongest regrowth from this stump for next season.' },
    ],
    planSteps: [
      { dateKind: 'today', icon: 'alert-triangle', title: 'Cut Immediately', desc: 'Don\u2019t wait any further — harvest this stem today, first in your rotation.' },
      { dateKind: 'tomorrow', icon: 'truck', title: 'Deliver Without Delay', desc: 'Get the bark to processing as fast as possible — long-overdue bark spoils quickly once cut.' },
      { dateKind: 'dryingRange', icon: 'droplet', title: 'Extended Drying Care', desc: 'This bark likely holds more moisture — monitor drying closely and extend it if needed to prevent mold.', isTip: true },
      { dateKind: 'projection', icon: 'refresh-cw', title: 'Rebuild Your Schedule', desc: 'Select strong new tillers now and set a reminder earlier next cycle to avoid this delay again.' },
    ],
  },
};

// small illustration of the recommended cut angle
const CuttingAngleGuide = () => (
  <View style={safeShadow} className="flex-row items-center bg-white rounded-3xl p-4 mb-4 border border-[#E8E6DD]">
    <View style={{ width: 64, height: 64 }} className="items-center justify-center mr-4">
      <View style={{ position: 'absolute', bottom: 6, width: 44, height: 3, backgroundColor: '#D8CFA9', borderRadius: 2 }} />
      <View style={{ position: 'absolute', bottom: 9, width: 8, height: 34, backgroundColor: '#4A6B4D', borderRadius: 4 }} />
      <View
        style={{
          position: 'absolute',
          bottom: 39,
          width: 26,
          height: 4,
          backgroundColor: '#B0453E',
          borderRadius: 2,
          transform: [{ rotate: '-24deg' }],
        }}
      />
    </View>
    <View className="flex-1">
      <Text className="text-base font-extrabold text-[#1F3021] mb-1">Cutting Guide</Text>
      <Text className="text-sm text-[#4F6851] leading-relaxed">
        Cut ~6 cm above the ground, angled slightly inward. A clean, sharp knife prevents tearing.
      </Text>
    </View>
  </View>
);

export default function HarvestScreen() {
  const [isModelReady, setIsModelReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<HarvestAnalysisResult | null>(null);

  // advice / action plan dropdown state
  const [isAdviceOpen, setIsAdviceOpen] = useState(false);
  const [isActionPlanOpen, setIsActionPlanOpen] = useState(true);

  // optional last-harvest date, used to personalize the projected date
  const [lastHarvestMonth, setLastHarvestMonth] = useState<number | null>(null);
  const [lastHarvestYear, setLastHarvestYear] = useState<number | null>(null);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState<number>(new Date().getFullYear());

  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();

  useEffect(() => {
    initializeHarvestEnsemble()
      .then(() => setIsModelReady(true))
      .catch((error) => {
        console.error("Failed to load ensemble models:", error);
        setModelError("Could not load the AI ensemble. Please restart the app.");
      });
      
    initializePlantGate().catch((err) => console.log('Gate init log:', err));
  }, []);

  const pickImage = async (useCamera: boolean) => {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.8,
    };

    let pickerResult;
    
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera access is needed to capture the bark.');
        return;
      }
      pickerResult = await ImagePicker.launchCameraAsync(options);
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Gallery access is required to select a photo.');
        return;
      }
      pickerResult = await ImagePicker.launchImageLibraryAsync(options);
    }

    if (!pickerResult.canceled) {
      setImageUri(pickerResult.assets[0].uri);
      setResult(null);
    }
  };

  const analyzeBark = async () => {
    if (!imageUri || !isModelReady) return;
    setIsAnalyzing(true);
    
    try {
      // @ts-ignore
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 224, height: 224 } }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );

      const isPlant = await runPlantValidation(manipulatedImage.uri);
      if (!isPlant) {
        Alert.alert(
          "Invalid Subject Detected", 
          "This image does not appear to be cinnamon bark. Please capture a clear, close-up photo of the stem surface.",
          [{ 
            text: "OK", 
            onPress: () => setTimeout(() => { 
              setImageUri(null); 
              setResult(null); 
            }, 150) 
          }]
        );
        return; 
      }

      const tensor = await imageToTensor(manipulatedImage.uri);
      const inferenceResult = await runHarvestInference(tensor);
      
      const score = parseFloat(inferenceResult.meanScore);
      const std = parseFloat(inferenceResult.stdDev);

      let mappedClass: ReadinessClass = 'Optimal';
      if (score < 0.66) mappedClass = 'Immature';
      else if (score > 1.33) mappedClass = 'Over-mature';

      setResult({
        readiness_score: score,
        std: std,
        predicted_class: mappedClass,
      });

      // open action plan, collapse advice on a fresh result
      setIsAdviceOpen(false);
      setIsActionPlanOpen(true);

    } catch (error) {
      console.error("Harvest Inference Error:", error);
      Alert.alert(
        "Analysis Failed", 
        "Could not process the image. Please try again.",
        [{ text: "OK", onPress: () => setTimeout(() => { setImageUri(null); setResult(null); }, 150) }]
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getRecommendation = (predictedClass: ReadinessClass) => {
    switch (predictedClass) {
      case 'Immature': return "Bark is too thin. Wait longer before peeling.";
      case 'Optimal': return "Prime readiness! Harvest now for a good gain.";
      case 'Over-mature': return "Past optimal time-frame. Bark may be tough to peel.";
    }
  };

  const getConfidenceInfo = (std: number) => {
    if (std < 0.05) return { level: 'High', color: '#059669', bg: '#D1FAE5', icon: 'check-circle' as const };
    if (std < 0.15) return { level: 'Medium', color: '#D97706', bg: '#FEF3C7', icon: 'minus-circle' as const };
    return { level: 'Low', color: '#E11D48', bg: '#FFE4E6', icon: 'alert-circle' as const };
  };

  const resetScanner = () => {
    if (isAnalyzing) return;    
    setTimeout(() => {
      setImageUri(null);
      setResult(null);
    }, 150);
  };

  const handleDiscussWithAI = () => {
    if (!result) return;

    const newChatId = Crypto.randomUUID();
    const chatTitle = `Harvest Scan: ${result.predicted_class}`;
    
    let chatColor = '#10B981'; 
    if (result.predicted_class === 'Immature') chatColor = '#F59E0B';
    else if (result.predicted_class === 'Over-mature') chatColor = '#F43F5E';

    try {
      db.runSync(
        'INSERT INTO plants (id, name, color, created_at) VALUES (?, ?, ?, ?)',
        [newChatId, chatTitle, chatColor, Date.now()]
      );
    } catch (err) {
      console.error("Failed to create new chat session in DB:", err);
      Alert.alert("Database Error", "Could not create a new chat session.");
      return;
    }

    const promptText = encodeURIComponent(
      `My cinnamon bark scan indicates a maturity status of "${result.predicted_class}" (Readiness score: ${result.readiness_score.toFixed(2)} / 2.00). What exact operational steps should I take next regarding stem harvesting, peeling technique and timing?`
    );

    router.push(`/chat/${newChatId}?autoPrompt=${promptText}`);
  };

  const toggleAdvice = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsAdviceOpen((prev) => !prev);
  };

  const toggleActionPlan = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsActionPlanOpen((prev) => !prev);
  };

  const toggleDatePicker = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsDatePickerOpen((prev) => !prev);
  };

  // sub-level drives which advice/timeline content shows
  const subLevel: SubLevel | null = useMemo(() => {
    if (!result) return null;
    return getSubLevel(result.readiness_score, result.predicted_class);
  }, [result]);

  // real calendar dates used in the timeline
  const today = useMemo(() => new Date(), [result]);
  const tomorrow = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() + 1); return d; }, [today]);
  const dryingStart = tomorrow;
  const dryingEnd = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() + 7); return d; }, [today]);

  // next milestone date, more urgent sub-levels get a shorter window
  const projectedDate = useMemo(() => {
    const now = new Date();
    if (!result || !subLevel) return now;

    const addWeeks = (w: number) => { const d = new Date(now); d.setDate(d.getDate() + Math.round(w * 7)); return d; };
    const addMonths = (m: number) => new Date(now.getFullYear(), now.getMonth() + m, 1);

    const isImmatureSubLevel = subLevel === 'veryImmature' || subLevel === 'nearlyReady';
    if (isImmatureSubLevel && lastHarvestMonth !== null && lastHarvestYear !== null) {
      const base = new Date(lastHarvestYear, lastHarvestMonth, 1);
      base.setMonth(base.getMonth() + TYPICAL_CYCLE_MONTHS);
      if (base.getTime() > now.getTime()) return base;
    }

    switch (subLevel) {
      case 'veryImmature': return addMonths(3);
      case 'nearlyReady': return addWeeks(2.5);
      case 'justOptimal': return addWeeks(2);
      case 'peakOptimal': return addWeeks(1);
      case 'slippingOptimal': return addWeeks(0.5);
      case 'freshOverMature': return addWeeks(1);
      case 'wayOverMature': return addWeeks(0.5);
      default: return addMonths(RECHECK_MONTHS_FALLBACK);
    }
  }, [result, subLevel, lastHarvestMonth, lastHarvestYear]);

  const getStepDateLabel = (kind: DateKind): string => {
    switch (kind) {
      case 'today': return `Today · ${formatShort(today)}`;
      case 'tomorrow': return `Tomorrow · ${formatShort(tomorrow)}`;
      case 'dryingRange': return `${formatShort(dryingStart)} – ${formatShort(dryingEnd)}`;
      case 'projection': return `~${formatMonthYear(projectedDate)}`;
      case 'ongoing':
      default: return 'Ongoing';
    }
  };

  const nextMilestoneLabel = `~${formatMonthYear(projectedDate)}`;

  const isCurrentSelection = (m: number, y: number) => lastHarvestMonth === m && lastHarvestYear === y;

  const isLocked = isAnalyzing || !isModelReady || !!modelError;

  return (
    <ScrollView 
      className="flex-1 bg-[#F0F4F1] px-6 pt-6" 
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 40 }} 
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row items-center self-start bg-[#E4ECE1] px-3 py-1.5 rounded-full mb-6 border border-[#CBDBC7]">
        <MaterialCommunityIcons name="layers-triple-outline" size={14} color="#3E5C41" />
        <Text className="text-[#3E5C41] text-[10px] font-bold ml-1.5 uppercase tracking-widest">Ensemble AI</Text>
      </View>

      <Text className="text-3xl font-extrabold text-[#1F3021] mb-2 tracking-tight">Harvest Readiness</Text>
      <Text className="mb-8 text-sm text-[#768C73] leading-relaxed">
        Determine the optimal time to peel cinnamon bark. Capture a clear, close-up photo of the stem surface.
      </Text>

      {modelError && (
        <View className="bg-[#FFF4F4] p-4 rounded-2xl border border-[#FDE8E8] mb-6 flex-row items-center">
          <MaterialCommunityIcons name="alert-circle-outline" size={24} color="#E11D48" />
          <Text className="text-[#881337] font-semibold ml-3 flex-1">{modelError}</Text>
        </View>
      )}

      <View className="mb-6">
        {!imageUri ? (
          <View className="flex-row justify-between mb-2">
            <TouchableOpacity
              onPress={() => pickImage(true)}
              disabled={isLocked}
              activeOpacity={0.85}
              style={[{ width: '48%' }, !isLocked && safeShadow]}
              className={`h-40 rounded-3xl items-center justify-center border transition-all ${
                isLocked ? 'bg-[#768C73] border-[#768C73] opacity-60' : 'bg-[#2D4530] border-[#3E5C41]'
              }`}
            >
              {isLocked && !modelError ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <MaterialCommunityIcons name="camera-iris" size={36} color="white" />
                  <Text className="text-white font-bold mt-3">Camera</Text>
                </>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity
              onPress={() => pickImage(false)}
              disabled={isLocked}
              activeOpacity={0.7}
              style={[{ width: '48%' }, !isLocked && safeShadow]}
              className={`h-40 bg-white border rounded-3xl items-center justify-center transition-all ${
                isLocked ? 'border-[#E8E6DD] opacity-60' : 'border-[#E8E6DD]'
              }`}
            >
              {isLocked && !modelError ? (
                <Text className="text-[#768C73] font-bold text-xs mt-3">Warming Models...</Text>
              ) : (
                <>
                  <MaterialCommunityIcons name="image-multiple-outline" size={32} color="#768C73" />
                  <Text className="text-[#4F6851] font-bold mt-3 text-sm">Gallery</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={safeShadow} className="w-full aspect-[4/5] bg-[#E8E6DD] rounded-[32px] overflow-hidden border-2 border-white relative">
            <Image source={{ uri: imageUri }} className="w-full h-full" resizeMode="cover" />
            
            {!isAnalyzing && !result && (
              <Pressable 
                onPress={resetScanner} 
                style={safeShadow} 
                className="absolute top-5 right-5 w-9 h-9 bg-white/95 rounded-full items-center justify-center active:bg-gray-200"
              >
                <Feather name="x" size={16} color="#1F3021" strokeWidth={2.5} />
              </Pressable>
            )}
            
            {isAnalyzing && (
              <View className="absolute inset-0 bg-[#1F3021]/60 items-center justify-center">
                <ActivityIndicator size="large" color="white" />
                <Text className="mt-4 font-bold text-white text-base tracking-wide">Evaluating Bark...</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {imageUri && !result && (
        <View>
          <TouchableOpacity
            onPress={analyzeBark}
            disabled={isLocked}
            activeOpacity={0.8}
            style={safeShadow}
            className={`py-4 rounded-2xl flex-row justify-center items-center border ${
              isLocked ? 'bg-[#768C73] border-[#768C73]' : 'bg-[#3E5C41] border-[#4A6B4D]'
            }`}
          >
            {isAnalyzing ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <>
                <MaterialCommunityIcons name="chart-bell-curve" size={22} color="white" />
                <Text className="text-white font-bold ml-2 text-base tracking-wide">Analyze Readiness</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {result && (
        <View>
          <View style={safeShadow} className="bg-white rounded-[32px] border border-[#E8E6DD] p-6 mb-6">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-[#768C73] font-bold text-[10px] uppercase tracking-widest">Ensemble Output</Text>
              <MaterialCommunityIcons 
                name={result.predicted_class === 'Optimal' ? "check-decagram" : "alert-circle-outline"} 
                size={22} 
                color={result.predicted_class === 'Optimal' ? "#10B981" : "#D97706"} 
              />
            </View>

            <Text className="text-3xl font-extrabold text-[#1F3021] mb-1">{result.predicted_class}</Text>
            <Text className="text-sm font-semibold text-[#4F6851] mb-8">{getRecommendation(result.predicted_class)}</Text>

            <View className="mb-8">
              <View className="flex-row justify-between mb-2 px-1">
                <Text className="text-[10px] font-bold text-[#768C73] uppercase tracking-wider">Immature</Text>
                <Text className="text-[10px] font-bold text-[#768C73] uppercase tracking-wider">Optimal</Text>
                <Text className="text-[10px] font-bold text-[#768C73] uppercase tracking-wider">Over-mature</Text>
              </View>
              
              <View className="h-3.5 w-full bg-[#F5F3E9] rounded-full flex-row overflow-hidden relative">
                <View className="flex-1 bg-[#FCD34D]" /> 
                <View className="flex-1 bg-[#34D399]" /> 
                <View className="flex-1 bg-[#FDBA74]" /> 
                
                <View 
                  style={{ left: `${Math.min(Math.max((result.readiness_score / 2) * 100, 0), 100)}%` }} 
                  className="absolute top-0 bottom-0 w-1.5 bg-[#1F3021] rounded-full -ml-[3px] border-[1px] border-white shadow-sm" 
                />
              </View>
              <Text className="text-center text-xs font-bold text-[#768C73] mt-2">Score: {result.readiness_score.toFixed(2)}</Text>
            </View>

            <View className="bg-[#F5F3E9] p-4 rounded-2xl border border-[#E8E6DD]">
              <View className="flex-row items-center mb-2">
                <Text className="font-bold text-[#1F3021] mr-2 text-sm">Model Consensus</Text>
                {(() => {
                  const conf = getConfidenceInfo(result.std);
                  return (
                    <View style={{ backgroundColor: conf.bg }} className="flex-row items-center px-2 py-1 rounded-md">
                      <Feather name={conf.icon} size={12} color={conf.color} className="mr-1" />
                      <Text style={{ color: conf.color }} className="text-xs font-bold">{conf.level}</Text>
                    </View>
                  );
                })()}
              </View>
              <Text className="text-[#4F6851] text-xs leading-relaxed">
                {result.std > 0.15 
                  ? "The ensemble models disagree. Consider performing a manual bark slit test to confirm readiness."
                  : `Deviation: ±${result.std.toFixed(3)}. Strong agreement among all AI models.`}
              </Text>
            </View>
          </View>

          {/* harvest advice + action plan */}
          {subLevel && (() => {
            const theme = THEME_BY_CLASS[result.predicted_class];
            const content = CONTENT_BY_SUBLEVEL[subLevel];
            return (
              <>
                {/* advice card */}
                <View className={`rounded-[28px] border-2 ${theme.border} ${theme.bg} mb-4 overflow-hidden`}>
                  <TouchableOpacity onPress={toggleAdvice} activeOpacity={0.7} className="flex-row items-center justify-between p-5">
                    <View className="flex-row items-center flex-1 pr-3">
                      <View className={`w-11 h-11 rounded-full ${theme.chip} items-center justify-center mr-3`}>
                        <Feather name={theme.icon} size={20} color="#1F3021" />
                      </View>
                      <View className="flex-1">
                        <Text className="text-[#1F3021] font-extrabold text-lg leading-tight">Harvest Advice</Text>
                        <Text className={`text-sm font-bold ${theme.text} mt-0.5`}>{content.subtitle}</Text>
                      </View>
                    </View>
                    <Feather name={isAdviceOpen ? 'chevron-up' : 'chevron-down'} size={22} color="#1F3021" />
                  </TouchableOpacity>

                  {isAdviceOpen && (
                    <View className="px-5 pb-5">
                      {content.showCutGuide && <CuttingAngleGuide />}

                      {content.advice.map((item, idx) => {
                        const isUrgent = item.emphasis === 'urgent';
                        return (
                          <View
                            key={`adv-${idx}`}
                            className={`flex-row items-start bg-white rounded-2xl p-3.5 mb-2.5 border ${isUrgent ? 'border-rose-300' : 'border-[#E8E6DD]'}`}
                          >
                            <View
                              className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${isUrgent ? 'bg-rose-500' : theme.dot}`}
                            >
                              <Feather name={item.icon} size={18} color="#fff" />
                            </View>
                            <Text
                              className={`flex-1 text-base leading-relaxed pt-1.5 ${isUrgent ? 'font-extrabold text-rose-700' : 'font-semibold text-[#1F3021]'}`}
                            >
                              {item.text}
                            </Text>
                          </View>
                        );
                      })}

                      <Text className="text-[10px] text-[#768C73] mt-2 italic">
                        Source: Ceylon Cinnamon GI Guidebook for Farmers, Vol. 01 — EDB Sri Lanka / IFC
                      </Text>
                    </View>
                  )}
                </View>

                {/* action plan card */}
                <View style={safeShadow} className="rounded-[28px] border border-[#E8E6DD] bg-white mb-6 overflow-hidden">
                  <TouchableOpacity onPress={toggleActionPlan} activeOpacity={0.7} className="flex-row items-center justify-between p-5">
                    <View className="flex-row items-center flex-1 pr-3">
                      <View className="w-11 h-11 rounded-full bg-[#F5F3E9] items-center justify-center mr-3">
                        <Feather name="check-square" size={20} color="#1F3021" />
                      </View>
                      <View className="flex-1">
                        <Text className="text-[#1F3021] font-extrabold text-lg leading-tight">Farmer Action Plan</Text>
                        <Text className="text-sm font-bold text-[#768C73] mt-0.5">Next milestone: {nextMilestoneLabel}</Text>
                      </View>
                    </View>
                    <Feather name={isActionPlanOpen ? 'chevron-up' : 'chevron-down'} size={22} color="#1F3021" />
                  </TouchableOpacity>

                  {isActionPlanOpen && (
                    <View className="px-5 pb-5">
                      {/* last-harvest date row, expands into a picker */}
                      <TouchableOpacity onPress={toggleDatePicker} activeOpacity={0.6} className="flex-row items-center justify-between py-2.5 mb-2 border-b border-[#F0EEE3]">
                        <View className="flex-row items-center flex-1">
                          <View className="w-7 h-7 rounded-full bg-[#F5F3E9] items-center justify-center mr-2">
                            <Feather name="calendar" size={13} color="#3E5C41" />
                          </View>
                          <Text className="text-xs text-[#768C73] flex-1">
                            {lastHarvestMonth !== null
                              ? <>Last harvest: <Text className="font-bold text-[#3E5C41]">{MONTH_NAMES[lastHarvestMonth]} {lastHarvestYear}</Text></>
                              : 'Add last harvest date to personalize these dates'}
                          </Text>
                        </View>
                        <Feather name={isDatePickerOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#B0BDB0" />
                      </TouchableOpacity>

                      {isDatePickerOpen && (
                        <View className="mb-4 pb-4 border-b border-[#F0EEE3] bg-[#F5F3E9] -mx-5 px-5 pt-4">
                          {/* year navigator */}
                          <View className="flex-row items-center justify-center mb-3">
                            <TouchableOpacity
                              onPress={() => setPickerYear((y) => y - 1)}
                              style={safeShadow}
                              className="w-9 h-9 rounded-full bg-white items-center justify-center"
                            >
                              <Feather name="chevron-left" size={18} color="#3E5C41" />
                            </TouchableOpacity>
                            <Text className="text-lg font-extrabold text-[#1F3021] mx-6">{pickerYear}</Text>
                            <TouchableOpacity
                              onPress={() => setPickerYear((y) => Math.min(y + 1, new Date().getFullYear()))}
                              style={safeShadow}
                              className="w-9 h-9 rounded-full bg-white items-center justify-center"
                            >
                              <Feather name="chevron-right" size={18} color="#3E5C41" />
                            </TouchableOpacity>
                          </View>

                          {/* month grid */}
                          <View className="flex-row flex-wrap justify-between">
                            {MONTH_NAMES_FULL.map((m, idx) => {
                              const selected = isCurrentSelection(idx, pickerYear);
                              return (
                                <TouchableOpacity
                                  key={m}
                                  onPress={() => { setLastHarvestMonth(idx); setLastHarvestYear(pickerYear); }}
                                  activeOpacity={0.7}
                                  style={{ width: '31%' }}
                                  className={`py-3 mb-2.5 rounded-2xl items-center justify-center ${selected ? 'bg-[#3E5C41]' : 'bg-white'}`}
                                >
                                  {selected && <Feather name="check" size={12} color="#fff" style={{ marginBottom: 2 }} />}
                                  <Text className={`text-xs font-bold ${selected ? 'text-white' : 'text-[#3E5C41]'}`}>{m.slice(0, 3)}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>

                          {lastHarvestMonth !== null && (
                            <TouchableOpacity onPress={() => { setLastHarvestMonth(null); setLastHarvestYear(null); }} className="mt-1 self-center">
                              <Text className="text-xs font-bold text-[#B0453E]">Clear date</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}

                      {/* timeline steps */}
                      {content.planSteps.map((step, idx) => {
                        const isLast = idx === content.planSteps.length - 1;
                        const circleBg = step.isTip ? 'bg-amber-400' : theme.dot;
                        return (
                          <View key={`plan-${idx}`} className="flex-row">
                            <View className="items-center mr-4" style={{ width: 48 }}>
                              <View style={safeShadow} className={`w-12 h-12 rounded-full ${circleBg} items-center justify-center`}>
                                <Feather name={step.icon} size={22} color="#fff" />
                              </View>
                              {!isLast && <View className="w-[2px] flex-1 bg-[#E8E6DD] my-1" />}
                            </View>
                            <View className={`flex-1 ${isLast ? '' : 'pb-6'} pt-1`}>
                              <View className="flex-row items-center flex-wrap mb-1">
                                {step.isTip && (
                                  <View className="bg-amber-100 px-2 py-0.5 rounded-md mr-2 mb-1">
                                    <Text className="text-[9px] font-extrabold text-amber-700 uppercase tracking-wider">Tip</Text>
                                  </View>
                                )}
                                <Text className="text-xs font-extrabold text-[#768C73] uppercase tracking-wider mb-1">
                                  {getStepDateLabel(step.dateKind)}
                                </Text>
                              </View>
                              <Text className="text-lg font-bold text-[#1F3021] mb-1">{step.title}</Text>
                              <Text className="text-base text-[#4F6851] leading-relaxed">{step.desc}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              </>
            );
          })()}

          <TouchableOpacity
            onPress={handleDiscussWithAI}
            activeOpacity={0.8}
            style={safeShadow}
            className="bg-[#2D4530] border border-[#3E5C41] py-4 rounded-2xl flex-row justify-center items-center mb-3"
          >
            <MaterialCommunityIcons name="robot-outline" size={20} color="white" />
            <Text className="text-white font-bold ml-2 text-base">Discuss with CinnLLM</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={resetScanner}
            activeOpacity={0.7}
            style={safeShadow}
            className="bg-white border border-[#E8E6DD] py-4 rounded-2xl flex-row justify-center items-center mb-6"
          >
            <Feather name="refresh-cw" size={18} color="#768C73" />
            <Text className="text-[#4F6851] font-bold ml-2 text-base">Scan Another Stem</Text>
          </TouchableOpacity>

        </View>
      )}
    </ScrollView>
  );
}