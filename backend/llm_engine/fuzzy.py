import re
import json
from datetime import date, timedelta
import numpy as np
import skfuzzy as fuzz
from skfuzzy import control as ctrl

def extract_number(text: str) -> float:
    # Pulls a floating-point number out of a string, returning None if nothing is found
    if not text:
        return None
    match = re.search(r'\d+(\.\d+)?', str(text))
    return float(match.group()) if match else None

# CINNAMON FERTILIZER RULE MATRIX
# A structured lookup table holding exact NPK dosages based on plant age and crop spacing
FERTILIZER_RULES = {
    "year_1": {
        "age_min": 0,
        "age_max": 2,
        "label": "Year 1",
        "4x3_ft": {"N": {"nutrient": "Nitrogen", "source": "Urea", "g_per_bush": 17, "kg_per_acre": 60}, "P": {"nutrient": "Phosphorus", "source": "Muriate of Potash", "g_per_bush": 8, "kg_per_acre": 30}, "K": {"nutrient": "Potassium", "source": "Eppawala Rock Phosphate", "g_per_bush": 8, "kg_per_acre": 30}},
        "4x2_ft": {"N": {"nutrient": "Nitrogen", "source": "Urea", "g_per_bush": 11, "kg_per_acre": 60}, "P": {"nutrient": "Phosphorus", "source": "Muriate of Potash", "g_per_bush": 6, "kg_per_acre": 30}, "K": {"nutrient": "Potassium", "source": "Eppawala Rock Phosphate", "g_per_bush": 6, "kg_per_acre": 30}},
    },
    "year_2": {
        "age_min": 2,
        "age_max": 3,
        "label": "Year 2",
        "4x3_ft": {"N": {"nutrient": "Nitrogen", "source": "Urea", "g_per_bush": 34, "kg_per_acre": 120}, "P": {"nutrient": "Phosphorus", "source": "Muriate of Potash", "g_per_bush": 17, "kg_per_acre": 60}, "K": {"nutrient": "Potassium", "source": "Eppawala Rock Phosphate", "g_per_bush": 17, "kg_per_acre": 60}},
        "4x2_ft": {"N": {"nutrient": "Nitrogen", "source": "Urea", "g_per_bush": 22, "kg_per_acre": 120}, "P": {"nutrient": "Phosphorus", "source": "Muriate of Potash", "g_per_bush": 11, "kg_per_acre": 60}, "K": {"nutrient": "Potassium", "source": "Eppawala Rock Phosphate", "g_per_bush": 11, "kg_per_acre": 60}},
    },
    "year_3_onwards": {
        "age_min": 3,
        "age_max": None,
        "label": "Year 3 onwards",
        "4x3_ft": {"N": {"nutrient": "Nitrogen", "source": "Urea", "g_per_bush": 50, "kg_per_acre": 180}, "P": {"nutrient": "Phosphorus", "source": "Muriate of Potash", "g_per_bush": 25, "kg_per_acre": 90}, "K": {"nutrient": "Potassium", "source": "Eppawala Rock Phosphate", "g_per_bush": 25, "kg_per_acre": 90}},
        "4x2_ft": {"N": {"nutrient": "Nitrogen", "source": "Urea", "g_per_bush": 33, "kg_per_acre": 180}, "P": {"nutrient": "Phosphorus", "source": "Muriate of Potash", "g_per_bush": 16, "kg_per_acre": 90}, "K": {"nutrient": "Potassium", "source": "Eppawala Rock Phosphate", "g_per_bush": 16, "kg_per_acre": 90}},
    },
}

def get_age_band(age_years: float) -> str:
    # Categorizes the raw age into specific growth bands used for fertilizer calculation
    if age_years < 0: raise ValueError("age_years cannot be negative.")
    if age_years < 2: return "year_1"
    if age_years < 3: return "year_2"
    return "year_3_onwards"

def dolomite_delay_passed(dolomite_applied: bool, dolomite_date: date | None, today: date) -> bool:
    # Ensures a mandatory 6-week waiting period passes after dolomite application before inorganic fertilizers are used
    if not dolomite_applied: return True
    if dolomite_date is None: return False
    return today >= dolomite_date + timedelta(weeks=6)

def recommend_cinnamon_fertilizer(age_years: float, spacing: str, season: str, dolomite_applied: bool = False, dolomite_date: date | None = None, today: date | None = None) -> dict:
    # Calculates crisp fertilizer dosages based on the predefined matrix, validating rules like the dolomite delay first
    today = today or date.today()
    if spacing not in {"4x3_ft", "4x2_ft"}: raise ValueError("Unsupported spacing. Use '4x3_ft' or '4x2_ft'.")
    if season.lower() not in {"yala", "maha"}: raise ValueError("Unsupported season. Use 'Yala' or 'Maha'.")
    
    if not dolomite_delay_passed(dolomite_applied, dolomite_date, today):
        return {"status": "blocked", "reason": "Wait 6 weeks after Dolomite.", "eligible_after": (dolomite_date + timedelta(weeks=6)).isoformat()}

    age_band = get_age_band(age_years)
    annual = FERTILIZER_RULES[age_band][spacing]
    seasonal_dose = {}
    
    # Splits the annual recommendation into two halves for the seasonal application
    for nutrient_code, values in annual.items():
        if nutrient_code in {"age_min", "age_max", "label"}: continue
        seasonal_dose[nutrient_code] = {
            "nutrient": values["nutrient"], "source": values["source"],
            "annual_g_per_bush": values["g_per_bush"], "annual_kg_per_acre": values["kg_per_acre"],
            "seasonal_g_per_bush": values["g_per_bush"] / 2, "seasonal_kg_per_acre": values["kg_per_acre"] / 2
        }

    return {
        "status": "ok", "crop": "cinnamon", "age_band": age_band, "spacing": spacing, "season": season.title(),
        "inorganic_fertilizer": seasonal_dose,
        "organic_integration": {"rule": "Combine 50g inorganic mixture with 1kg compost manure per bush annually."}
    }

def build_cinnamon_fis():    
    # Define inputs and their logical ranges (e.g., rainfall in mm, elevation in meters)
    rainfall = ctrl.Antecedent(np.arange(0, 5001, 1), "rainfall")
    elevation = ctrl.Antecedent(np.arange(0, 1501, 1), "elevation")
    soil_pH = ctrl.Antecedent(np.arange(3.0, 8.01, 0.01), "soil_pH")

    # Map raw input values to fuzzy categories (Low, Optimal, Excessive, etc.)
    rainfall["Low"] = fuzz.trapmf(rainfall.universe, [0, 0, 1500, 1750])
    rainfall["Optimal"] = fuzz.trapmf(rainfall.universe, [1500, 1750, 3500, 3750])
    rainfall["Excessive"] = fuzz.trapmf(rainfall.universe, [3500, 3750, 5000, 5000])

    elevation["Optimal"] = fuzz.trapmf(elevation.universe, [0, 0, 650, 700])
    elevation["High_Weakening"] = fuzz.trapmf(elevation.universe, [700, 800, 1500, 1500])

    soil_pH["Highly_Acidic"] = fuzz.trapmf(soil_pH.universe, [3.0, 3.0, 4.3, 4.5])
    soil_pH["Optimal"] = fuzz.trapmf(soil_pH.universe, [4.3, 4.5, 5.5, 5.7])
    soil_pH["Alkaline"] = fuzz.trapmf(soil_pH.universe, [5.5, 5.7, 8.0, 8.0])

    # Define the outputs (interventions and warnings) that the system will decide on
    apply_dolomite = ctrl.Consequent(np.arange(0, 1.01, 0.01), "apply_dolomite")
    delay_fertilizer = ctrl.Consequent(np.arange(0, 1.01, 0.01), "delay_fertilizer")
    irrigation_warning = ctrl.Consequent(np.arange(0, 1.01, 0.01), "irrigation_warning")
    yield_warning = ctrl.Consequent(np.arange(0, 1.01, 0.01), "yield_warning")
    drainage_warning = ctrl.Consequent(np.arange(0, 1.01, 0.01), "drainage_warning")
    alkaline_soil_warning = ctrl.Consequent(np.arange(0, 1.01, 0.01), "alkaline_soil_warning")
    standard_fertilizer_permission = ctrl.Consequent(np.arange(0, 1.01, 0.01), "standard_fertilizer_permission")
    dolomite_rate = ctrl.Consequent(np.arange(0, 1001, 1), "dolomite_rate")

    # Set up simple Yes/No fuzzy sets for boolean-like warnings
    for var in [apply_dolomite, delay_fertilizer, irrigation_warning, yield_warning, drainage_warning, alkaline_soil_warning]:
        var["No"] = fuzz.trimf(var.universe, [0.0, 0.0, 0.5])
        var["Yes"] = fuzz.trimf(var.universe, [0.5, 1.0, 1.0])

    # Set up categories for permission levels and specific rates
    standard_fertilizer_permission["Blocked"] = fuzz.trimf(standard_fertilizer_permission.universe, [0.0, 0.0, 0.35])
    standard_fertilizer_permission["Caution"] = fuzz.trimf(standard_fertilizer_permission.universe, [0.25, 0.5, 0.75])
    standard_fertilizer_permission["Allowed"] = fuzz.trimf(standard_fertilizer_permission.universe, [0.65, 1.0, 1.0])

    dolomite_rate["None"] = fuzz.trimf(dolomite_rate.universe, [0, 0, 100])
    dolomite_rate["Recommended_500_1000"] = fuzz.trapmf(dolomite_rate.universe, [500, 650, 850, 1000])

    # Rule base linking environmental conditions directly to outcomes
    rules = [
        ctrl.Rule(soil_pH["Highly_Acidic"], apply_dolomite["Yes"]),
        ctrl.Rule(soil_pH["Highly_Acidic"], delay_fertilizer["Yes"]),
        ctrl.Rule(soil_pH["Highly_Acidic"], dolomite_rate["Recommended_500_1000"]),
        ctrl.Rule(soil_pH["Highly_Acidic"], standard_fertilizer_permission["Blocked"]),
        ctrl.Rule(rainfall["Low"], irrigation_warning["Yes"]),
        ctrl.Rule(elevation["High_Weakening"], yield_warning["Yes"]),
        ctrl.Rule(rainfall["Optimal"] & elevation["Optimal"] & soil_pH["Optimal"], standard_fertilizer_permission["Allowed"]),
        ctrl.Rule(rainfall["Excessive"], drainage_warning["Yes"]),
        ctrl.Rule(soil_pH["Alkaline"], alkaline_soil_warning["Yes"]),
        ctrl.Rule(soil_pH["Alkaline"], standard_fertilizer_permission["Caution"]),
        ctrl.Rule(rainfall["Low"] & elevation["Optimal"] & soil_pH["Optimal"], standard_fertilizer_permission["Caution"]),
        ctrl.Rule(rainfall["Optimal"] & elevation["High_Weakening"] & soil_pH["Optimal"], standard_fertilizer_permission["Caution"]),
        ctrl.Rule(rainfall["Excessive"] & elevation["Optimal"] & soil_pH["Optimal"], standard_fertilizer_permission["Caution"]),
        ctrl.Rule(soil_pH["Optimal"], apply_dolomite["No"]),
        ctrl.Rule(soil_pH["Optimal"], delay_fertilizer["No"]),
        ctrl.Rule(soil_pH["Optimal"], dolomite_rate["None"]),
        ctrl.Rule(rainfall["Optimal"], irrigation_warning["No"]),
        ctrl.Rule(elevation["Optimal"], yield_warning["No"]),
        ctrl.Rule(rainfall["Optimal"], drainage_warning["No"]),
        ctrl.Rule(soil_pH["Optimal"], alkaline_soil_warning["No"])
    ]
    return ctrl.ControlSystem(rules)

CINNAMON_FIS_CTRL = build_cinnamon_fis()

# Helper functions to translate fuzzy scores back into clear binary flags or text labels
def bool_flag(value: float, threshold: float = 0.5) -> bool: return float(value) >= threshold
def permission_label(score: float) -> str:
    score = float(score)
    if score >= 0.65: return "allowed"
    if score >= 0.35: return "caution"
    return "blocked"

def build_farmer_actions(outputs: dict) -> list[str]:
    # Translates the triggered warnings and recommendations into a readable, step-by-step list
    actions = []
    step_no = 1
    if bool_flag(outputs.get("apply_dolomite", 0)):
        actions.append(f"Step {step_no}: Apply dolomite at approx {round(float(outputs.get('dolomite_rate', 0)),0):.0f} kg/ha.")
        step_no += 1
    if bool_flag(outputs.get("delay_fertilizer", 0)):
        actions.append(f"Step {step_no}: Wait 6 weeks after dolomite application.")
        step_no += 1
    if bool_flag(outputs.get("irrigation_warning", 0)):
        actions.append(f"Step {step_no}: Rainfall is low. Arrange irrigation.")
        step_no += 1
    if bool_flag(outputs.get("drainage_warning", 0)):
        actions.append(f"Step {step_no}: Excessive rainfall. Check drainage.")
        step_no += 1
    if bool_flag(outputs.get("yield_warning", 0)):
        actions.append(f"Step {step_no}: High elevation. Expect lower yield.")
        step_no += 1
    if bool_flag(outputs.get("alkaline_soil_warning", 0)):
        actions.append(f"Step {step_no}: Soil is alkaline. Do not apply dolomite.")
        step_no += 1

    permission = permission_label(outputs.get("standard_fertilizer_permission", 0))
    if permission == "allowed": actions.append(f"Step {step_no}: Proceed with standard NPK routine.")
    elif permission == "caution": actions.append(f"Step {step_no}: Standard fertilizer may proceed with caution.")
    else: actions.append(f"Step {step_no}: Resolve the blocking soil condition first.")
    return actions

def recommend_environmental_interventions(rainfall_mm_year: float, elevation_m: float, soil_ph_value: float) -> dict:
    # Runs the actual simulation by passing raw field data into the defined fuzzy logic system
    sim = ctrl.ControlSystemSimulation(CINNAMON_FIS_CTRL)
    sim.input["rainfall"] = rainfall_mm_year
    sim.input["elevation"] = elevation_m
    sim.input["soil_pH"] = soil_ph_value
    sim.compute()
    
    outputs = {k: sim.output.get(k, 0) for k in ["apply_dolomite", "delay_fertilizer", "irrigation_warning", "yield_warning", "drainage_warning", "alkaline_soil_warning", "standard_fertilizer_permission", "dolomite_rate"]}
    return {
        "standard_fertilizer_permission": permission_label(outputs["standard_fertilizer_permission"]),
        "farmer_actions": build_farmer_actions(outputs)
    }

def recommend_complete_cinnamon_plan(age_years: float, spacing: str, season: str, rainfall_mm_year: float, elevation_m: float, soil_ph_value: float, dolomite_applied: bool = False, dolomite_date: date | None = None, today: date | None = None) -> dict:
    # Main wrapper coordinating the environmental safety check and the crisp fertilizer calculation
    env_result = recommend_environmental_interventions(rainfall_mm_year, elevation_m, soil_ph_value)
    permission = env_result["standard_fertilizer_permission"]

    # Halt the process entirely if the environment is deemed unsafe for fertilizer
    if permission == "blocked":
        return {"status": "blocked", "reason": "Environmental safety blocked release.", "farmer_message": env_result["farmer_actions"]}

    # If the environment passes, calculate specific dosage numbers
    fert_result = recommend_cinnamon_fertilizer(age_years, spacing, season, dolomite_applied, dolomite_date, today)

    # Secondary halt if the crisp rules (like the 6-week dolomite delay) fail
    if fert_result["status"] == "blocked":
        return {"status": "blocked", "reason": fert_result["reason"], "farmer_message": [*env_result["farmer_actions"], f"Wait until {fert_result['eligible_after']}."]}

    # Merge successful results, retaining any cautionary environmental warnings
    return {
        "status": "caution" if permission == "caution" else "ok",
        "fertilizer_recommendation": fert_result,
        "farmer_message": [*env_result["farmer_actions"], "Apply exact fertilizer quantities shown."]
    }