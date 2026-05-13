import re
import numpy as np
import joblib
from flask import Flask, request, jsonify
from flask_cors import CORS

# ─── App setup ────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

# ─── Load artefacts ───────────────────────────────────────────────────────────
model = joblib.load("cinnamon_model.pkl")
le    = joblib.load("cinnamon_label_encoder.pkl")
enc   = joblib.load("cinnamon_ordinal_encoder.pkl")

try:
    NUM_COLS = joblib.load("cinnamon_num_cols.pkl")
except FileNotFoundError:
    NUM_COLS = ['shoot_height_cm', 'trunk_circumference_cm', 'shoot_age_months', 'num_leaves']

try:
    MEDIANS = joblib.load("cinnamon_medians.pkl")
except FileNotFoundError:
    MEDIANS = {
        'shoot_height_cm':        134.5,
        'trunk_circumference_cm':   3.07,
        'shoot_age_months':        15.0,
        'num_leaves':              15.0,
    }

print("✅ Model loaded! Classes:", le.classes_)
# Expected: ['Borderline', 'Not Ready', 'Ready']

# ─── Categorical defaults ─────────────────────────────────────────────────────
CAT_COLS = ["leaf_color", "bark_color", "bark_texture", "straightness"]
CAT_DEFAULTS = {
    "leaf_color":   "yellowish green",   # mid-maturity neutral
    "bark_color":   "medium brown",      # mid-maturity neutral
    "bark_texture": "slightly rough",    # mid-maturity neutral
    "straightness": "slightly straight", # mid-maturity neutral
}

# ─── Field groups ─────────────────────────────────────────────────────────────
FIELD_GROUPS = {
    "numeric":     ["shoot_height_cm", "trunk_circumference_cm", "shoot_age_months", "num_leaves"],
    "categorical": ["leaf_color", "bark_color", "bark_texture", "straightness"],
}
TOTAL_FIELDS      = 8
MIN_FIELDS_PREDICT = 1
MIN_FIELDS_RELIABLE = 4

# ─── Feature importance weights (from GB model) ───────────────────────────────
# Used for Grad-CAM-equivalent feature attribution
FEATURE_WEIGHTS = {
    "trunk_circumference_cm": 0.2795,
    "shoot_age_months":       0.2248,
    "shoot_height_cm":        0.1726,
    "bark_color":             0.1111,
    "bark_texture":           0.0913,
    "num_leaves":             0.0556,
    "leaf_color":             0.0413,
    "straightness":           0.0238,
}

# ─── Per-class thresholds (from dataset analysis) ────────────────────────────
CLASS_THRESHOLDS = {
    "shoot_height_cm": {
        "Ready":      (140, 180),
        "Borderline": (115, 145),
        "Not Ready":  (42,  120),
    },
    "trunk_circumference_cm": {
        "Ready":      (3.4, 6.9),
        "Borderline": (2.7, 3.6),
        "Not Ready":  (0.9, 2.9),
    },
    "shoot_age_months": {
        "Ready":      (18, 24),
        "Borderline": (11, 18),
        "Not Ready":  (8,  13),
    },
    "num_leaves": {
        "Ready":      (14, 26),
        "Borderline": (12, 22),
        "Not Ready":  (3,  16),
    },
}


# ─── Natural-language parser ──────────────────────────────────────────────────
def parse_text(text: str) -> dict:
    raw = text.lower()
    fields: dict = {k: None for k in
                    ["shoot_height_cm", "trunk_circumference_cm", "shoot_age_months",
                     "num_leaves", "leaf_color", "bark_texture", "bark_color", "straightness"]}

    def find_num(pattern):
        m = re.search(pattern, raw)
        return float(m.group(1)) if m else None

    # Height
    h = find_num(r'height\D{0,15}?(\d+(?:\.\d+)?)\s*cm')
    if h is None:
        h = find_num(r'(\d+(?:\.\d+)?)\s*cm\s*(?:tall|height|high)')
    if h is None:
        m = re.search(r'(\d+(?:\.\d+)?)\s*cm', raw)
        if m:
            h = float(m.group(1))
    fields["shoot_height_cm"] = h

    # Trunk circumference
    t = find_num(r'trunk\D{0,20}?(\d+(?:\.\d+)?)\s*cm')
    if t is None:
        t = find_num(r'circumference\D{0,15}?(\d+(?:\.\d+)?)\s*cm')
    if t is None and h is not None:
        all_cm = re.findall(r'(\d+(?:\.\d+)?)\s*cm', raw)
        if len(all_cm) >= 2:
            t = float(all_cm[1])
    fields["trunk_circumference_cm"] = t

    # Age
    a = find_num(r'age\D{0,15}?(\d+(?:\.\d+)?)\s*month')
    if a is None:
        a = find_num(r'(\d+(?:\.\d+)?)\s*month')
    if a is None:
        a = find_num(r'(\d+(?:\.\d+)?)\s*mo\b')
    fields["shoot_age_months"] = a

    # Leaf count
    lc = find_num(r'(\d+)\s*(?:number of\s*)?leaves')
    if lc is None:
        lc = find_num(r'(\d+)\s*leaf')
    if lc is None:
        lc = find_num(r'leaves\D{0,8}?(\d+)')
    fields["num_leaves"] = lc

    # Leaf colour
    if re.search(r'yellowish\s*green|yellow[\s-]*green', raw):
        fields["leaf_color"] = "yellowish green"
    elif re.search(r'brownish\s*green|brown[\s-]*green', raw):
        fields["leaf_color"] = "brownish green"
    elif re.search(r'dark\s*green', raw):
        fields["leaf_color"] = "dark green"
    elif re.search(r'bright\s*green|light\s*green|fresh\s*green', raw):
        fields["leaf_color"] = "bright green"

    # Bark texture
    if re.search(r'rough\s*and\s*peel|peeling', raw):
        fields["bark_texture"] = "rough and peeling"
    elif re.search(r'smooth\s*and\s*soft|smooth|soft', raw):
        fields["bark_texture"] = "smooth and soft"
    elif re.search(r'slightly\s*rough|a\s*bit\s*rough', raw):
        fields["bark_texture"] = "slightly rough"
    elif re.search(r'rough', raw):
        fields["bark_texture"] = "rough and peeling"

    # Bark colour
    if re.search(r'dark\s*brown', raw):
        fields["bark_color"] = "dark brown"
    elif re.search(r'medium\s*brown', raw):
        fields["bark_color"] = "medium brown"
    elif re.search(r'light\s*brown', raw):
        fields["bark_color"] = "light brown"
    elif re.search(r'bark\s*(?:is\s*)?green|green\s*bark', raw):
        fields["bark_color"] = "green"

    # Straightness
    if re.search(r'very\s*straight', raw):
        fields["straightness"] = "very straight"
    elif re.search(r'slightly\s*straight|a\s*bit\s*straight', raw):
        fields["straightness"] = "slightly straight"
    elif re.search(r'curved|bent|not\s*straight', raw):
        fields["straightness"] = "curved"
    elif re.search(r'straight', raw):
        fields["straightness"] = "very straight"

    return fields


# ─── Completeness analysis ────────────────────────────────────────────────────
def analyse_completeness(fields: dict) -> dict:
    provided_num = [k for k in FIELD_GROUPS["numeric"]     if fields.get(k) is not None]
    provided_cat = [k for k in FIELD_GROUPS["categorical"] if fields.get(k) is not None]
    all_provided  = provided_num + provided_cat
    total_provided = len(all_provided)

    missing_num = [k for k in FIELD_GROUPS["numeric"]     if fields.get(k) is None]
    missing_cat = [k for k in FIELD_GROUPS["categorical"] if fields.get(k) is None]

    if total_provided >= 7:
        tier, tier_label = "high",     "High Confidence"
    elif total_provided >= 4:
        tier, tier_label = "medium",   "Medium Confidence"
    elif total_provided >= 2:
        tier, tier_label = "low",      "Low Confidence"
    else:
        tier, tier_label = "very_low", "Very Low Confidence"

    field_name_map = {
        "shoot_height_cm":        "Shoot height (cm)",
        "trunk_circumference_cm": "Trunk circumference (cm)",
        "shoot_age_months":       "Shoot age (months)",
        "num_leaves":             "Number of leaves",
        "leaf_color":             "Leaf colour",
        "bark_color":             "Bark colour",
        "bark_texture":           "Bark texture",
        "straightness":           "Shoot straightness",
    }
    missing_labels = [field_name_map[k] for k in (missing_num + missing_cat)]

    return {
        "total_provided":  total_provided,
        "total_fields":    TOTAL_FIELDS,
        "provided_fields": all_provided,
        "missing_fields":  missing_labels,
        "tier":            tier,
        "tier_label":      tier_label,
        "can_predict":     total_provided >= MIN_FIELDS_PREDICT,
        "is_reliable":     total_provided >= MIN_FIELDS_RELIABLE,
    }


# ─── Build feature vector ─────────────────────────────────────────────────────
def build_feature_vector(fields: dict) -> np.ndarray:
    num_vals = []
    for col in NUM_COLS:
        val = fields.get(col)
        num_vals.append(float(val) if val is not None else float(MEDIANS.get(col, 0.0)))

    cat_vals = [[
        fields.get("leaf_color")   or CAT_DEFAULTS["leaf_color"],
        fields.get("bark_color")   or CAT_DEFAULTS["bark_color"],
        fields.get("bark_texture") or CAT_DEFAULTS["bark_texture"],
        fields.get("straightness") or CAT_DEFAULTS["straightness"],
    ]]
    X_cat = enc.transform(cat_vals)
    return np.hstack([np.array([num_vals]), X_cat])


# ─── Grad-CAM equivalent: feature attribution ─────────────────────────────────
def compute_feature_attribution(fields: dict, prediction: str) -> list:
    """
    Compute per-feature attribution scores indicating how much each
    provided field supports or opposes the predicted class.
    This is analogous to Grad-CAM for tabular data: we weight each
    feature's value against class thresholds by the feature importance.
    Returns a list of dicts: {feature, value, attribution, direction, explanation}
    """
    attributions = []

    def numeric_attr(key, val, label):
        if val is None:
            return
        importance = FEATURE_WEIGHTS.get(key, 0.0)
        thresholds = CLASS_THRESHOLDS.get(key, {})
        pred_range = thresholds.get(prediction)
        if pred_range:
            lo, hi = pred_range
            mid = (lo + hi) / 2
            span = (hi - lo) / 2 or 1
            # Normalised distance from class centre: 1.0 = perfect match
            dist = max(0, 1 - abs(val - mid) / (span * 1.5))
            attr_score = round(importance * dist * 100, 1)
            direction  = "supports" if dist > 0.4 else "opposes"
        else:
            attr_score = round(importance * 50, 1)
            direction  = "neutral"

        # Human explanation
        if key == "shoot_height_cm":
            if prediction == "Ready" and val >= 140:
                exp = f"{val} cm is solidly in the harvest-ready zone (Ready class avg 146 cm)."
            elif prediction == "Ready" and val >= 115:
                exp = f"{val} cm meets the height threshold for readiness; other indicators confirm."
            elif prediction == "Borderline" and 115 <= val <= 145:
                exp = f"{val} cm is in the borderline zone (115–145 cm); needs other signals to confirm."
            elif prediction == "Not Ready" and val < 120:
                exp = f"{val} cm is below the harvest-ready range (≥ 140 cm); Not Ready avg is 108 cm."
            else:
                exp = f"Height {val} cm is a moderate signal for {prediction}; other field values will sharpen the prediction."

        elif key == "trunk_circumference_cm":
            if prediction == "Ready" and val >= 3.4:
                exp = f"Trunk {val} cm is strong (Ready avg 3.8 cm)."
            elif prediction == "Borderline" and 2.7 <= val <= 3.6:
                exp = f"Trunk {val} cm is in the borderline range."
            elif prediction == "Not Ready" and val < 2.9:
                exp = f"Trunk {val} cm is thin (Not Ready avg 2.3 cm)."
            else:
                exp = f"Trunk circumference {val} cm aligns with the {prediction} profile."

        elif key == "shoot_age_months":
            if prediction == "Ready" and val >= 18:
                exp = f"{int(val)} months is in the prime harvest window (Ready avg 19 mo)."
            elif prediction == "Borderline" and 11 <= val <= 18:
                exp = f"{int(val)} months is in the borderline development window."
            elif prediction == "Not Ready" and val < 13:
                exp = f"{int(val)} months is early stage (Not Ready avg 11 mo)."
            else:
                exp = f"Shoot age {int(val)} months partially supports the {prediction} prediction."

        elif key == "num_leaves":
            if val >= 14:
                exp = f"{int(val)} leaves is in the Ready range (avg 17 leaves)."
            elif val >= 12:
                exp = f"{int(val)} leaves is in the Borderline range."
            else:
                exp = f"{int(val)} leaves is low (Not Ready avg 12 leaves)."

        else:
            exp = f"{label}: {val} aligns with the {prediction} profile."

        attributions.append({
            "feature":     key,
            "label":       label,
            "value":       val,
            "attribution": attr_score,
            "direction":   direction,
            "explanation": exp,
        })

    def categorical_attr(key, val, label):
        if val is None:
            return
        importance = FEATURE_WEIGHTS.get(key, 0.0)

        # Maturity scores for each category value
        maturity = {
            "leaf_color":   {"bright green": 0, "dark green": 1, "yellowish green": 2, "brownish green": 3},
            "bark_color":   {"green": 0, "light brown": 1, "medium brown": 2, "dark brown": 3},
            "bark_texture": {"smooth and soft": 0, "slightly rough": 1, "rough and peeling": 2},
            "straightness": {"curved": 0, "slightly straight": 1, "very straight": 2},
        }
        score_map  = maturity.get(key, {})
        val_score  = score_map.get(val, 1)
        max_score  = max(score_map.values()) if score_map else 1

        # Align with prediction
        if prediction == "Ready":
            alignment = val_score / max_score
        elif prediction == "Not Ready":
            alignment = 1 - val_score / max_score
        else:  # Borderline
            alignment = 1 - abs(val_score / max_score - 0.5) * 2

        attr_score = round(importance * alignment * 100, 1)
        direction  = "supports" if alignment > 0.4 else "opposes"

        # Human explanations
        explanations = {
            "leaf_color": {
                "brownish green":  "Brownish green is the strongest indicator of full maturity.",
                "yellowish green": "Yellowish green suggests near-maturity.",
                "dark green":      "Dark green indicates active growth, not yet harvest-ready.",
                "bright green":    "Bright green means the shoot is young and immature.",
            },
            "bark_color": {
                "dark brown":   "Dark brown bark indicates a well-matured, harvest-ready shoot.",
                "medium brown": "Medium brown confirms the shoot is reaching full maturity.",
                "light brown":  "Light brown bark suggests the shoot is still developing.",
                "green":        "Green bark means the shoot is immature.",
            },
            "bark_texture": {
                "rough and peeling": "Rough and peeling bark is the clearest visual sign of readiness.",
                "slightly rough":    "Slightly rough bark means approaching — but not at — peak readiness.",
                "smooth and soft":   "Smooth and soft bark indicates an immature, not-ready shoot.",
            },
            "straightness": {
                "very straight":     "Very straight growth yields the highest-quality quills.",
                "slightly straight": "Moderately straight; acceptable quality.",
                "curved":            "Curved growth reduces quill quality.",
            },
        }
        exp = explanations.get(key, {}).get(val, f"{label}: {val}.")

        attributions.append({
            "feature":     key,
            "label":       label,
            "value":       val,
            "attribution": attr_score,
            "direction":   direction,
            "explanation": exp,
        })

    numeric_attr("trunk_circumference_cm", fields.get("trunk_circumference_cm"), "Trunk circumference")
    numeric_attr("shoot_age_months",       fields.get("shoot_age_months"),       "Shoot age")
    numeric_attr("shoot_height_cm",        fields.get("shoot_height_cm"),        "Shoot height")
    numeric_attr("num_leaves",             fields.get("num_leaves"),             "Leaf count")
    categorical_attr("bark_color",   fields.get("bark_color"),   "Bark colour")
    categorical_attr("bark_texture", fields.get("bark_texture"), "Bark texture")
    categorical_attr("leaf_color",   fields.get("leaf_color"),   "Leaf colour")
    categorical_attr("straightness", fields.get("straightness"), "Straightness")

    # Sort by attribution score descending
    attributions.sort(key=lambda x: -x["attribution"])
    return attributions


# ─── Next-action guidelines ───────────────────────────────────────────────────
def generate_guidelines(prediction: str, fields: dict, attributions: list) -> dict:
    """
    Generate CCGI-aligned actionable guidelines based on the predicted stage
    and the specific field values provided.
    """
    h  = fields.get("shoot_height_cm")
    t  = fields.get("trunk_circumference_cm")
    a  = fields.get("shoot_age_months")
    lc = fields.get("num_leaves")
    bt = fields.get("bark_texture")

    if prediction == "Ready":
        steps = [
            "🌿 **Harvest now** — coppice the shoot at exactly 6 cm from the ground at a 45° angle (CCGI Guidebook §3.3).",
            "🔪 Use a sharp, CRI-certified peeling knife to remove the outer bark cleanly.",
            "📏 Confirm trunk circumference ≥ 3.4 cm before cutting; undersized shoots reduce quill quality.",
            "⏱️ Harvest in the morning when bark is most pliable for easier peeling.",
            "📦 After harvesting, peel within 2–4 hours and dry in shade for 5–7 days.",
            "📋 Record the shoot's measurements for your farm log (required for CCGI export certification).",
        ]
        recheck = None
        urgency = "high"

    elif prediction == "Borderline":
        weeks_needed = None
        if a is not None and a < 18:
            weeks_needed = max(2, (18 - int(a)) * 4)
        elif h is not None and h < 140:
            weeks_needed = 3
        else:
            weeks_needed = 4

        steps = [
            f"⏳ **Re-assess in {weeks_needed} weeks** — the shoot is approaching but not at peak readiness.",
        ]
        if h is not None and h < 140:
            steps.append(f"📏 Height is {h} cm; target ≥ 140 cm. Monitor growth rate weekly.")
        if t is not None and t < 3.4:
            steps.append(f"🌀 Trunk is {t} cm; target ≥ 3.4 cm for optimal quill thickness.")
        if a is not None and a < 18:
            steps.append(f"📅 Shoot is {int(a)} months old; harvest typically at 18–24 months.")
        if bt in ("smooth and soft", None):
            steps.append("👁️ Watch for bark texture to turn slightly rough — key visual trigger.")
        steps += [
            "💧 Maintain consistent irrigation; water stress can delay maturity by 2–3 weeks.",
            "🌱 Apply balanced fertiliser (NPK 12-6-20) if leaf colour is pale or yellowing.",
        ]
        recheck = f"{weeks_needed} weeks"
        urgency = "medium"

    else:  # Not Ready
        weeks_needed = None
        if a is not None:
            weeks_needed = max(6, (18 - int(a)) * 4)
        elif h is not None:
            weeks_needed = max(6, int((140 - h) / 2))
        else:
            weeks_needed = 8

        steps = [
            f"🚫 **Do not harvest** — the shoot needs {weeks_needed}+ weeks of further development.",
            "🌱 Allow the shoot to continue growing; early harvest severely reduces bark thickness and oil content.",
        ]
        if h is not None and h < 110:
            steps.append(f"📏 Height {h} cm is well below the harvest zone (≥ 140 cm). Minimum ~{int(140 - h)} cm growth still needed.")
        if t is not None and t < 2.5:
            steps.append(f"🌀 Trunk is very thin ({t} cm). Target ≥ 3.4 cm. Support shoot with a stake if needed.")
        if a is not None and a < 12:
            steps.append(f"📅 Only {int(a)} months old; shoots typically need 18–24 months for full maturity.")
        steps += [
            "💧 Ensure irrigation reaches the root zone; drought stress at early stages reduces long-term yield.",
            "🐛 Inspect for pests (cinnamon butterfly, thrips) which can stunt growth at this stage.",
            "📋 Log this observation and re-check in 6–8 weeks.",
        ]
        recheck = f"{weeks_needed} weeks"
        urgency = "low"

    return {
        "steps":   steps[:6],
        "recheck": recheck,
        "urgency": urgency,
    }


# ─── Routes ───────────────────────────────────────────────────────────────────
@app.route("/api/parse", methods=["POST"])
def api_parse():
    data = request.get_json(force=True)
    text = data.get("text", "").strip()
    if not text:
        return jsonify({"error": "text field is required"}), 400
    fields = parse_text(text)
    completeness = analyse_completeness(fields)
    return jsonify({"fields": fields, "completeness": completeness})


@app.route("/api/predict", methods=["POST"])
def api_predict():
    data         = request.get_json(force=True)
    fields       = data.get("fields", {})
    completeness = data.get("completeness") or analyse_completeness(fields)

    if not completeness["can_predict"]:
        return jsonify({
            "error":        "insufficient_data",
            "message":      "Please provide at least one measurement to get a prediction.",
            "completeness": completeness,
        }), 422

    X          = build_feature_vector(fields)
    pred_idx   = model.predict(X)[0]
    proba      = model.predict_proba(X)[0]
    classes    = le.classes_
    prediction = le.inverse_transform([pred_idx])[0]

    confidence   = {cls: round(float(p) * 100, 1) for cls, p in zip(classes, proba)}
    attributions = compute_feature_attribution(fields, prediction)
    guidelines   = generate_guidelines(prediction, fields, attributions)

    # Top 5 explanation reasons (from attributions)
    reasons = [a["explanation"] for a in attributions[:5]]

    return jsonify({
        "prediction":   prediction,
        "confidence":   confidence,
        "reasons":      reasons,
        "attributions": attributions,   # Grad-CAM equivalent
        "guidelines":   guidelines,
        "completeness": completeness,
    })


@app.route("/", methods=["GET"])
def health():
    return jsonify({
        "status":  "ok",
        "message": "Cinnamon Harvest API running!",
        "classes": list(le.classes_),
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)