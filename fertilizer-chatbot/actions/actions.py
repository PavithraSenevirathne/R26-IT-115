from typing import Any, Text, Dict, List
from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher

import json
from datetime import date, timedelta

import numpy as np
import skfuzzy as fuzz
from skfuzzy import control as ctrl


# CINNAMON FERTILIZER RULE MATRIX

FERTILIZER_RULES = {
    "year_1": {
        "age_min": 0,
        "age_max": 2,
        "label": "Year 1",
        "4x3_ft": {
            "N": {
                "nutrient": "Nitrogen",
                "source": "Urea",
                "g_per_bush": 17,
                "kg_per_acre": 60
            },
            "P": {
                "nutrient": "Phosphorus",
                "source": "Muriate of Potash",
                "g_per_bush": 8,
                "kg_per_acre": 30
            },
            "K": {
                "nutrient": "Potassium",
                "source": "Eppawala Rock Phosphate",
                "g_per_bush": 8,
                "kg_per_acre": 30
            },
        },
        "4x2_ft": {
            "N": {
                "nutrient": "Nitrogen",
                "source": "Urea",
                "g_per_bush": 11,
                "kg_per_acre": 60
            },
            "P": {
                "nutrient": "Phosphorus",
                "source": "Muriate of Potash",
                "g_per_bush": 6,
                "kg_per_acre": 30
            },
            "K": {
                "nutrient": "Potassium",
                "source": "Eppawala Rock Phosphate",
                "g_per_bush": 6,
                "kg_per_acre": 30
            },
        },
    },

    "year_2": {
        "age_min": 2,
        "age_max": 3,
        "label": "Year 2",
        "4x3_ft": {
            "N": {
                "nutrient": "Nitrogen",
                "source": "Urea",
                "g_per_bush": 34,
                "kg_per_acre": 120
            },
            "P": {
                "nutrient": "Phosphorus",
                "source": "Muriate of Potash",
                "g_per_bush": 17,
                "kg_per_acre": 60
            },
            "K": {
                "nutrient": "Potassium",
                "source": "Eppawala Rock Phosphate",
                "g_per_bush": 17,
                "kg_per_acre": 60
            },
        },
        "4x2_ft": {
            "N": {
                "nutrient": "Nitrogen",
                "source": "Urea",
                "g_per_bush": 22,
                "kg_per_acre": 120
            },
            "P": {
                "nutrient": "Phosphorus",
                "source": "Muriate of Potash",
                "g_per_bush": 11,
                "kg_per_acre": 60
            },
            "K": {
                "nutrient": "Potassium",
                "source": "Eppawala Rock Phosphate",
                "g_per_bush": 11,
                "kg_per_acre": 60
            },
        },
    },

    "year_3_onwards": {
        "age_min": 3,
        "age_max": None,
        "label": "Year 3 onwards",
        "4x3_ft": {
            "N": {
                "nutrient": "Nitrogen",
                "source": "Urea",
                "g_per_bush": 50,
                "kg_per_acre": 180
            },
            "P": {
                "nutrient": "Phosphorus",
                "source": "Muriate of Potash",
                "g_per_bush": 25,
                "kg_per_acre": 90
            },
            "K": {
                "nutrient": "Potassium",
                "source": "Eppawala Rock Phosphate",
                "g_per_bush": 25,
                "kg_per_acre": 90
            },
        },
        "4x2_ft": {
            "N": {
                "nutrient": "Nitrogen",
                "source": "Urea",
                "g_per_bush": 33,
                "kg_per_acre": 180
            },
            "P": {
                "nutrient": "Phosphorus",
                "source": "Muriate of Potash",
                "g_per_bush": 16,
                "kg_per_acre": 90
            },
            "K": {
                "nutrient": "Potassium",
                "source": "Eppawala Rock Phosphate",
                "g_per_bush": 16,
                "kg_per_acre": 90
            },
        },
    },
}


def get_age_band(age_years: float) -> str:
    """
    Maps plant age to fertilizer recommendation band.
    """

    if age_years < 0:
        raise ValueError("age_years cannot be negative.")

    if age_years < 2:
        return "year_1"

    if age_years < 3:
        return "year_2"

    return "year_3_onwards"


def dolomite_delay_passed(
    dolomite_applied: bool,
    dolomite_date: date | None,
    today: date
) -> bool:
    """
    Returns True if inorganic fertilizer can be applied after dolomite.
    Fertilizer must be delayed for 6 weeks after dolomite application.
    """

    if not dolomite_applied:
        return True

    if dolomite_date is None:
        return False

    return today >= dolomite_date + timedelta(weeks=6)


def recommend_cinnamon_fertilizer(
    age_years: float,
    spacing: str,
    season: str,
    dolomite_applied: bool = False,
    dolomite_date: date | None = None,
    today: date | None = None
) -> dict:
    """
    Returns the crisp fertilizer recommendation using:
    - plant age
    - crop spacing
    - season
    - dolomite delay rule
    """

    today = today or date.today()

    if spacing not in {"4x3_ft", "4x2_ft"}:
        raise ValueError("Unsupported spacing. Use '4x3_ft' or '4x2_ft'.")

    if season.lower() not in {"yala", "maha"}:
        raise ValueError("Unsupported season. Use 'Yala' or 'Maha'.")

    if not dolomite_delay_passed(dolomite_applied, dolomite_date, today):
        eligible_after = dolomite_date + timedelta(weeks=6)

        return {
            "status": "blocked",
            "reason": "Dolomite was applied. Wait 6 weeks before inorganic fertilizer application.",
            "eligible_after": eligible_after.isoformat()
        }

    age_band = get_age_band(age_years)
    annual = FERTILIZER_RULES[age_band][spacing]

    seasonal_dose = {}

    for nutrient_code, values in annual.items():
        if nutrient_code in {"age_min", "age_max", "label"}:
            continue

        seasonal_dose[nutrient_code] = {
            "nutrient": values["nutrient"],
            "source": values["source"],
            "annual_g_per_bush": values["g_per_bush"],
            "annual_kg_per_acre": values["kg_per_acre"],
            "seasonal_g_per_bush": values["g_per_bush"] / 2,
            "seasonal_kg_per_acre": values["kg_per_acre"] / 2
        }

    return {
        "status": "ok",
        "crop": "cinnamon",
        "age_band": age_band,
        "age_label": FERTILIZER_RULES[age_band]["label"],
        "spacing": spacing,
        "season": season.title(),
        "trigger": f"onset_of_{season.lower()}_monsoon_rains",
        "inorganic_fertilizer": seasonal_dose,
        "organic_integration": {
            "compost_manure_kg_per_bush_per_year": 1,
            "inorganic_mixture_g_per_bush_per_year": 50,
            "rule": "Combine 50g inorganic mixture with 1kg compost manure per bush annually."
        },
        "schedule": {
            "annual_split_rule": "Divide annual fertilizer recommendation into two equal doses.",
            "current_season_fraction": 0.5,
            "seasons": ["Yala", "Maha"]
        }
    }


# FUZZY ENVIRONMENTAL SAFETY SYSTEM

def build_cinnamon_fis():
    """
    Builds and returns the Mamdani fuzzy control system.
    """
    # Environmental inputs
    rainfall = ctrl.Antecedent(np.arange(0, 5001, 1), "rainfall")
    elevation = ctrl.Antecedent(np.arange(0, 1501, 1), "elevation")
    soil_pH = ctrl.Antecedent(np.arange(3.0, 8.01, 0.01), "soil_pH")

    # Rainfall membership functions
    rainfall["Low"] = fuzz.trapmf(
        rainfall.universe,
        [0, 0, 1500, 1750]
    )

    rainfall["Optimal"] = fuzz.trapmf(
        rainfall.universe,
        [1500, 1750, 3500, 3750]
    )

    rainfall["Excessive"] = fuzz.trapmf(
        rainfall.universe,
        [3500, 3750, 5000, 5000]
    )

    # Elevation membership functions
    elevation["Optimal"] = fuzz.trapmf(
        elevation.universe,
        [0, 0, 650, 700]
    )

    elevation["High_Weakening"] = fuzz.trapmf(
        elevation.universe,
        [700, 800, 1500, 1500]
    )

    # Soil pH membership functions
    soil_pH["Highly_Acidic"] = fuzz.trapmf(
        soil_pH.universe,
        [3.0, 3.0, 4.3, 4.5]
    )

    soil_pH["Optimal"] = fuzz.trapmf(
        soil_pH.universe,
        [4.3, 4.5, 5.5, 5.7]
    )

    soil_pH["Alkaline"] = fuzz.trapmf(
        soil_pH.universe,
        [5.5, 5.7, 8.0, 8.0]
    )

    # Intervention outputs

    apply_dolomite = ctrl.Consequent(
        np.arange(0, 1.01, 0.01),
        "apply_dolomite"
    )

    delay_fertilizer = ctrl.Consequent(
        np.arange(0, 1.01, 0.01),
        "delay_fertilizer"
    )

    irrigation_warning = ctrl.Consequent(
        np.arange(0, 1.01, 0.01),
        "irrigation_warning"
    )

    yield_warning = ctrl.Consequent(
        np.arange(0, 1.01, 0.01),
        "yield_warning"
    )

    drainage_warning = ctrl.Consequent(
        np.arange(0, 1.01, 0.01),
        "drainage_warning"
    )

    alkaline_soil_warning = ctrl.Consequent(
        np.arange(0, 1.01, 0.01),
        "alkaline_soil_warning"
    )

    standard_fertilizer_permission = ctrl.Consequent(
        np.arange(0, 1.01, 0.01),
        "standard_fertilizer_permission"
    )

    dolomite_rate = ctrl.Consequent(
        np.arange(0, 1001, 1),
        "dolomite_rate"
    )

    # Binary flags
    binary_outputs = [
        apply_dolomite,
        delay_fertilizer,
        irrigation_warning,
        yield_warning,
        drainage_warning,
        alkaline_soil_warning
    ]

    for output_var in binary_outputs:
        output_var["No"] = fuzz.trimf(
            output_var.universe,
            [0.0, 0.0, 0.5]
        )

        output_var["Yes"] = fuzz.trimf(
            output_var.universe,
            [0.5, 1.0, 1.0]
        )

    # Fertilizer permission membership functions
    standard_fertilizer_permission["Blocked"] = fuzz.trimf(
        standard_fertilizer_permission.universe,
        [0.0, 0.0, 0.35]
    )

    standard_fertilizer_permission["Caution"] = fuzz.trimf(
        standard_fertilizer_permission.universe,
        [0.25, 0.5, 0.75]
    )

    standard_fertilizer_permission["Allowed"] = fuzz.trimf(
        standard_fertilizer_permission.universe,
        [0.65, 1.0, 1.0]
    )

    # Dolomite rate
    dolomite_rate["None"] = fuzz.trimf(
        dolomite_rate.universe,
        [0, 0, 100]
    )

    dolomite_rate["Recommended_500_1000"] = fuzz.trapmf(
        dolomite_rate.universe,
        [500, 650, 850, 1000]
    )

    # Rule base
    rules = [

        # Rule 1: Acidity
        ctrl.Rule(
            soil_pH["Highly_Acidic"],
            apply_dolomite["Yes"]
        ),

        ctrl.Rule(
            soil_pH["Highly_Acidic"],
            delay_fertilizer["Yes"]
        ),

        ctrl.Rule(
            soil_pH["Highly_Acidic"],
            dolomite_rate["Recommended_500_1000"]
        ),

        ctrl.Rule(
            soil_pH["Highly_Acidic"],
            standard_fertilizer_permission["Blocked"]
        ),

        # Rule 2: Low rainfall
        ctrl.Rule(
            rainfall["Low"],
            irrigation_warning["Yes"]
        ),

        # Rule 3: High elevation
        ctrl.Rule(
            elevation["High_Weakening"],
            yield_warning["Yes"]
        ),

        # Rule 4: Fully optimal path
        ctrl.Rule(
            rainfall["Optimal"] & elevation["Optimal"] & soil_pH["Optimal"],
            standard_fertilizer_permission["Allowed"]
        ),

        # Rule 5: Excessive rainfall
        ctrl.Rule(
            rainfall["Excessive"],
            drainage_warning["Yes"]
        ),

        # Rule 6: Alkaline pH safety
        ctrl.Rule(
            soil_pH["Alkaline"],
            alkaline_soil_warning["Yes"]
        ),

        ctrl.Rule(
            soil_pH["Alkaline"],
            standard_fertilizer_permission["Caution"]
        ),

        # Rule 7: Low rainfall but otherwise suitable
        ctrl.Rule(
            rainfall["Low"] & elevation["Optimal"] & soil_pH["Optimal"],
            standard_fertilizer_permission["Caution"]
        ),

        # Rule 8: High elevation but otherwise suitable
        ctrl.Rule(
            rainfall["Optimal"] & elevation["High_Weakening"] & soil_pH["Optimal"],
            standard_fertilizer_permission["Caution"]
        ),

        # Rule 9: Excessive rainfall but otherwise suitable
        ctrl.Rule(
            rainfall["Excessive"] & elevation["Optimal"] & soil_pH["Optimal"],
            standard_fertilizer_permission["Caution"]
        ),

        # Stabilizer rules
        ctrl.Rule(
            soil_pH["Optimal"],
            apply_dolomite["No"]
        ),

        ctrl.Rule(
            soil_pH["Optimal"],
            delay_fertilizer["No"]
        ),

        ctrl.Rule(
            soil_pH["Optimal"],
            dolomite_rate["None"]
        ),

        ctrl.Rule(
            rainfall["Optimal"],
            irrigation_warning["No"]
        ),

        ctrl.Rule(
            elevation["Optimal"],
            yield_warning["No"]
        ),

        ctrl.Rule(
            rainfall["Optimal"],
            drainage_warning["No"]
        ),

        ctrl.Rule(
            soil_pH["Optimal"],
            alkaline_soil_warning["No"]
        )
    ]

    cinnamon_fis_ctrl = ctrl.ControlSystem(rules)

    return cinnamon_fis_ctrl


CINNAMON_FIS_CTRL = build_cinnamon_fis()


# FUZZY OUTPUT HELPERS

def bool_flag(value: float, threshold: float = 0.5) -> bool:
    """
    Converts fuzzy score into Boolean flag.
    """
    return float(value) >= threshold


def permission_label(score: float) -> str:
    """
    Converts defuzzified permission score into label.
    """
    score = float(score)

    if score >= 0.65:
        return "allowed"

    if score >= 0.35:
        return "caution"

    return "blocked"


def build_farmer_actions(outputs: dict) -> list[str]:
    """
    Creates step-by-step human-readable actions from fuzzy outputs.
    """
    actions = []

    apply_dolomite_flag = bool_flag(outputs.get("apply_dolomite", 0))
    delay_flag = bool_flag(outputs.get("delay_fertilizer", 0))
    irrigation_flag = bool_flag(outputs.get("irrigation_warning", 0))
    yield_flag = bool_flag(outputs.get("yield_warning", 0))
    drainage_flag = bool_flag(outputs.get("drainage_warning", 0))
    alkaline_flag = bool_flag(outputs.get("alkaline_soil_warning", 0))

    permission = permission_label(
        outputs.get("standard_fertilizer_permission", 0)
    )

    dolomite_kg_ha = round(
        float(outputs.get("dolomite_rate", 0)),
        0
    )

    step_no = 1

    if apply_dolomite_flag:
        actions.append(
            f"Step {step_no}: Apply dolomite at approximately "
            f"{dolomite_kg_ha:.0f} kg/ha. Recommended range: 500-1000 kg/ha "
            f"where soil pH is below 4.5."
        )
        step_no += 1

    if delay_flag:
        actions.append(
            f"Step {step_no}: Wait 6 weeks after dolomite application before "
            f"applying inorganic fertilizer."
        )
        step_no += 1

    if irrigation_flag:
        actions.append(
            f"Step {step_no}: Rainfall is low for cinnamon. Arrange sufficient "
            f"irrigation before or along with fertilizer scheduling."
        )
        step_no += 1

    if drainage_flag:
        actions.append(
            f"Step {step_no}: Rainfall is excessive. Check drainage, soil "
            f"conservation, and erosion risk before fertilizer application."
        )
        step_no += 1

    if yield_flag:
        actions.append(
            f"Step {step_no}: Elevation is above the recommended commercial "
            f"range. Expect possible plant weakening or lower yield."
        )
        step_no += 1

    if alkaline_flag:
        actions.append(
            f"Step {step_no}: Soil pH is above the cinnamon optimal range. "
            f"Do not apply dolomite. Confirm with a soil test before adjusting pH."
        )
        step_no += 1

    if permission == "allowed":
        actions.append(
            f"Step {step_no}: Proceed with the standard cinnamon NPK fertilizer "
            f"routine. Split the annual recommendation into two equal doses at "
            f"the onset of Yala and Maha rains."
        )

    elif permission == "caution":
        actions.append(
            f"Step {step_no}: Standard fertilizer may proceed with caution after "
            f"addressing the warnings above. Split the annual recommendation into "
            f"two equal doses at the onset of Yala and Maha rains."
        )

    else:
        actions.append(
            f"Step {step_no}: Do not release the standard inorganic fertilizer "
            f"recommendation yet. Resolve the blocking soil condition first."
        )

    return actions


def recommend_environmental_interventions(
    rainfall_mm_year: float,
    elevation_m: float,
    soil_ph_value: float
) -> dict:
    """
    Runs the Mamdani FIS and returns environmental safety assessment.
    """
    if not (0 <= rainfall_mm_year <= 5000):
        raise ValueError("rainfall_mm_year must be between 0 and 5000.")

    if not (0 <= elevation_m <= 1500):
        raise ValueError("elevation_m must be between 0 and 1500.")

    if not (3.0 <= soil_ph_value <= 8.0):
        raise ValueError("soil_ph_value must be between 3.0 and 8.0.")

    sim = ctrl.ControlSystemSimulation(CINNAMON_FIS_CTRL)

    sim.input["rainfall"] = rainfall_mm_year
    sim.input["elevation"] = elevation_m
    sim.input["soil_pH"] = soil_ph_value

    sim.compute()

    outputs = {
        "apply_dolomite": sim.output.get("apply_dolomite", 0),
        "delay_fertilizer": sim.output.get("delay_fertilizer", 0),
        "irrigation_warning": sim.output.get("irrigation_warning", 0),
        "yield_warning": sim.output.get("yield_warning", 0),
        "drainage_warning": sim.output.get("drainage_warning", 0),
        "alkaline_soil_warning": sim.output.get("alkaline_soil_warning", 0),
        "standard_fertilizer_permission": sim.output.get(
            "standard_fertilizer_permission",
            0
        ),
        "dolomite_rate": sim.output.get("dolomite_rate", 0)
    }

    payload = {
        "input": {
            "rainfall_mm_year": rainfall_mm_year,
            "elevation_m": elevation_m,
            "soil_pH": soil_ph_value
        },
        "fuzzy_scores": {
            key: round(float(value), 3)
            for key, value in outputs.items()
        },
        "flags": {
            "apply_dolomite": bool_flag(outputs["apply_dolomite"]),
            "delay_fertilizer_6_weeks": bool_flag(
                outputs["delay_fertilizer"]
            ),
            "irrigation_warning": bool_flag(
                outputs["irrigation_warning"]
            ),
            "yield_warning": bool_flag(
                outputs["yield_warning"]
            ),
            "drainage_warning": bool_flag(
                outputs["drainage_warning"]
            ),
            "alkaline_soil_warning": bool_flag(
                outputs["alkaline_soil_warning"]
            )
        },
        "dolomite_rate_kg_ha": round(
            float(outputs["dolomite_rate"]),
            0
        ),
        "standard_fertilizer_permission": permission_label(
            outputs["standard_fertilizer_permission"]
        ),
        "farmer_actions": build_farmer_actions(outputs)
    }

    return payload


# CConnected Recommendation Engine

def recommend_complete_cinnamon_plan(
    age_years: float,
    spacing: str,
    season: str,
    rainfall_mm_year: float,
    elevation_m: float,
    soil_ph_value: float,
    dolomite_applied: bool = False,
    dolomite_date: date | None = None,
    today: date | None = None
) -> dict:
    """
    Complete cinnamon recommendation engine.

    This connects:
    1. Fuzzy environmental safety gate
    2. Crisp age x spacing x season fertilizer matrix
    3. Dolomite delay rule
    4. Farmer-facing output JSON
    """

    today = today or date.today()

    # Run fuzzy environmental assessment

    environmental_result = recommend_environmental_interventions(
        rainfall_mm_year=rainfall_mm_year,
        elevation_m=elevation_m,
        soil_ph_value=soil_ph_value
    )

    permission = environmental_result["standard_fertilizer_permission"]

    # If fuzzy system blocks fertilizer, stop here

    if permission == "blocked":
        return {
            "status": "blocked",
            "crop": "cinnamon",
            "reason": "Environmental fuzzy safety system blocked fertilizer release.",
            "environmental_assessment": environmental_result,
            "fertilizer_recommendation": None,
            "farmer_message": environmental_result["farmer_actions"],
            "developer_note": (
                "The crisp fertilizer matrix was not called because "
                "the fuzzy gate returned blocked."
            )
        }

    # Call crisp fertilizer recommendation matrix

    fertilizer_result = recommend_cinnamon_fertilizer(
        age_years=age_years,
        spacing=spacing,
        season=season,
        dolomite_applied=dolomite_applied,
        dolomite_date=dolomite_date,
        today=today
    )

    # If dolomite delay blocks fertilizer, stop here

    if fertilizer_result["status"] == "blocked":
        return {
            "status": "blocked",
            "crop": "cinnamon",
            "reason": fertilizer_result["reason"],
            "eligible_after": fertilizer_result["eligible_after"],
            "environmental_assessment": environmental_result,
            "fertilizer_recommendation": None,
            "farmer_message": [
                *environmental_result["farmer_actions"],
                f"Do not apply inorganic fertilizer until {fertilizer_result['eligible_after']}."
            ],
            "developer_note": (
                "The fuzzy system allowed or cautioned fertilizer release, "
                "but the crisp dolomite-delay rule blocked it."
            )
        }

    # Merge environmental warnings and fertilizer dose

    if permission == "caution":
        final_status = "caution"
        final_message = (
            "Fertilizer recommendation is provided with environmental warnings."
        )

    else:
        final_status = "ok"
        final_message = (
            "Fertilizer recommendation is safe under current fuzzy environmental assessment."
        )

    return {
        "status": final_status,
        "crop": "cinnamon",
        "message": final_message,
        "environmental_assessment": environmental_result,
        "fertilizer_recommendation": fertilizer_result,
        "farmer_message": [
            *environmental_result["farmer_actions"],
            "Apply the exact fertilizer quantities shown in the fertilizer_recommendation section."
        ],
        "developer_note": (
            "Fuzzy FIS controls permission and warnings. "
            "Crisp dictionary controls exact fertilizer dosage."
        )
    }


# EXAMPLE TEST RUNS
def print_json(data: dict) -> None:
    """
    Prints JSON and safely converts date objects.
    """

    print(json.dumps(data, indent=2, default=str))


if __name__ == "__main__":

    # Example 1: Fully suitable condition
    print("\n=== OPTIMAL FIELD ===\n")

    result_1 = recommend_complete_cinnamon_plan(
        age_years=3,
        spacing="4x3_ft",
        season="Yala",
        rainfall_mm_year=2200,
        elevation_m=300,
        soil_ph_value=5.0,
        dolomite_applied=False
    )

    print_json(result_1)

    # Example 2: Highly acidic soil
    print("\n=== ACIDIC SOIL ===\n")

    result_2 = recommend_complete_cinnamon_plan(
        age_years=3,
        spacing="4x3_ft",
        season="Yala",
        rainfall_mm_year=2200,
        elevation_m=300,
        soil_ph_value=4.2,
        dolomite_applied=False
    )

    print_json(result_2)

    # Example 3: Low rainfall but pH and elevation are suitable
    print("\n=== LOW RAINFALL ===\n")

    result_3 = recommend_complete_cinnamon_plan(
        age_years=2.5,
        spacing="4x2_ft",
        season="Maha",
        rainfall_mm_year=1600,
        elevation_m=300,
        soil_ph_value=5.0,
        dolomite_applied=False
    )

    print_json(result_3)

    # Example 4: Dolomite already applied, but 6 weeks not passed
    print("\n=== DOLOMITE DELAY ACTIVE ===\n")

    result_4 = recommend_complete_cinnamon_plan(
        age_years=3,
        spacing="4x3_ft",
        season="Yala",
        rainfall_mm_year=2200,
        elevation_m=300,
        soil_ph_value=5.0,
        dolomite_applied=True,
        dolomite_date=date.today() - timedelta(weeks=2)
    )

    print_json(result_4)

    # Example 5: High elevation and excessive rainfall
    print("\n=== HIGH ELEVATION + EXCESS RAINFALL ===\n")

    result_5 = recommend_complete_cinnamon_plan(
        age_years=4,
        spacing="4x3_ft",
        season="Maha",
        rainfall_mm_year=3900,
        elevation_m=850,
        soil_ph_value=5.0,
        dolomite_applied=False
    )

    print_json(result_5)

class ActionCalculateFertilizer(Action):
    def name(self) -> Text:
        return "action_calculate_fertilizer"

    def run(self, dispatcher: CollectingDispatcher,
            tracker: Tracker,
            domain: Dict[Text, Any]) -> List[Dict[Text, Any]]:

        # 1. Extract the 6 variables the Rasa form just collected
        age_years = tracker.get_slot("age_years")
        spacing = tracker.get_slot("spacing")
        season = tracker.get_slot("season")
        rainfall = tracker.get_slot("rainfall_mm_year")
        elevation = tracker.get_slot("elevation_m")
        soil_ph = tracker.get_slot("soil_ph_value")

        # Basic fallback in case a slot is missing 
        if None in [age_years, spacing, season, rainfall, elevation, soil_ph]:
            dispatcher.utter_message(text="I'm missing some information to complete the calculation. Let's try again.")
            return []

        try:
            # 2. Feed the variables into your fuzzy logic engine
            result = recommend_complete_cinnamon_plan(
                age_years=float(age_years),
                spacing=spacing,
                season=season,
                rainfall_mm_year=float(rainfall),
                elevation_m=float(elevation),
                soil_ph_value=float(soil_ph),
                dolomite_applied=False
            )

            # 3. Send the results back to the user
            dispatcher.utter_message(text="Here is your custom fertilizer assessment:")
            
            # Iterate through the farmer actions and send each as a chat bubble
            for message in result.get("farmer_message", []):
                dispatcher.utter_message(text=message)

        except Exception as e:
            dispatcher.utter_message(text=f"Sorry, I encountered an error calculating that: {str(e)}")

        return []