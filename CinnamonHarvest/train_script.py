import pandas as pd
import numpy as np
import shap
import warnings

from sklearn.preprocessing import OrdinalEncoder, LabelEncoder, StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.model_selection import train_test_split, StratifiedKFold, RandomizedSearchCV
from sklearn.ensemble import VotingClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, roc_auc_score

from xgboost import XGBClassifier
from lightgbm import LGBMClassifier

warnings.filterwarnings('ignore', category=UserWarning)

# Load dataset
df = pd.read_csv('Cinnamon_Harvest_Data.csv')
print(f"Total rows: {len(df)}")
print("harvest_readiness distribution:\n", df['harvest_readiness'].value_counts())

# Define feature columns & Encodings
leaf_order     = ['bright green', 'dark green', 'yellowish green', 'brownish green']
bark_col_order = ['green', 'light brown', 'medium brown', 'dark brown']
bark_tex_order = ['smooth and soft', 'slightly rough', 'rough and peeling']
straight_order = ['curved', 'slightly straight', 'very straight']

cat_cols = ['leaf_color', 'bark_color', 'bark_texture', 'straightness']
num_cols = ['shoot_height_cm', 'trunk_circumference_cm', 'shoot_age_months', 'num_leaves', 'ccgi_score']

# Target Encoding and Train/Test Split
le = LabelEncoder()
y = le.fit_transform(df['harvest_readiness'])
X = df[cat_cols + num_cols] 

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)
print(f"\nTraining rows: {len(X_train)} | Testing rows: {len(X_test)}")
print("Classes:", le.classes_)

# Build Robust Preprocessing Pipeline
num_transformer = Pipeline(steps=[
    ('imputer', SimpleImputer(strategy='median')),
    ('scaler', StandardScaler()) 
])

cat_transformer = Pipeline(steps=[
    ('imputer', SimpleImputer(strategy='most_frequent')),
    ('ordinal', OrdinalEncoder(
        categories=[leaf_order, bark_col_order, bark_tex_order, straight_order],
        handle_unknown='use_encoded_value',
        unknown_value=-1
    ))
])

preprocessor = ColumnTransformer(transformers=[
    ('num', num_transformer, num_cols),
    ('cat', cat_transformer, cat_cols)
])

# Define SOTA Models & Ensemble
xgb = XGBClassifier(eval_metric='mlogloss', random_state=42)
lgbm = LGBMClassifier(random_state=42, verbose=-1)

ensemble = VotingClassifier(
    estimators=[('xgb', xgb), ('lgbm', lgbm)],
    voting='soft'
)

model_pipeline = Pipeline(steps=[
    ('preprocessor', preprocessor),
    ('classifier', ensemble)
])

# Hyperparameter Tuning
print("\nInitiating Hyperparameter Tuning via RandomizedSearchCV")

param_distributions = {
    'classifier__xgb__n_estimators': [100, 300, 500],
    'classifier__xgb__max_depth': [3, 5, 7],
    'classifier__xgb__learning_rate': [0.01, 0.05, 0.1],
    'classifier__lgbm__n_estimators': [100, 300, 500],
    'classifier__lgbm__max_depth': [3, 5, 7],
    'classifier__lgbm__learning_rate': [0.01, 0.05, 0.1]
}

skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=99)

search = RandomizedSearchCV(
    model_pipeline, 
    param_distributions=param_distributions, 
    n_iter=15, 
    cv=skf, 
    scoring='accuracy', 
    random_state=42,
    n_jobs=-1
)

search.fit(X_train, y_train)
best_model = search.best_estimator_
print(f"Best CV Accuracy: {search.best_score_:.1%}")

# Evaluation
print("Evaluating Best Model on Held-out Test Set")
y_pred = best_model.predict(X_test)
y_proba = best_model.predict_proba(X_test)

acc = accuracy_score(y_test, y_pred)
roc_auc = roc_auc_score(y_test, y_proba, multi_class='ovr', average='macro')

print(f"Test Accuracy: {acc:.1%}")
print(f"Test Macro ROC-AUC: {roc_auc:.3f}\n")

print("Classification Report:")
print(classification_report(y_test, y_pred, target_names=le.classes_))

print("Confusion Matrix:")
print(pd.DataFrame(confusion_matrix(y_test, y_pred), 
                   index=[f"True {c}" for c in le.classes_], 
                   columns=[f"Pred {c}" for c in le.classes_]))

# Advanced Feature Importance (SHAP)
print(" Calculating SHAP Values for Model Explainability ")
X_train_transformed = best_model.named_steps['preprocessor'].transform(X_train)
X_test_transformed = best_model.named_steps['preprocessor'].transform(X_test)
feature_names = num_cols + cat_cols


lgbm_best = best_model.named_steps['classifier'].estimators_[1]

explainer = shap.TreeExplainer(lgbm_best)
shap_values = explainer.shap_values(X_test_transformed)

if isinstance(shap_values, list):
    mean_shap = np.abs(np.array(shap_values)).mean(axis=(0, 1))
else:
    mean_shap = np.abs(shap_values).mean(axis=(0, 2)) if shap_values.ndim == 3 else np.abs(shap_values).mean(axis=0)

print("\nGlobal Feature Importances (SHAP via LightGBM):")
for name, imp in sorted(zip(feature_names, mean_shap), key=lambda x: -x[1]):
    max_imp = max(mean_shap) if max(mean_shap) > 0 else 1
    bar = '█' * int((imp / max_imp) * 40) 
    print(f"  {name:<30} {imp:.4f}  {bar}")


def quick_test(label, test_dict):
    test_df = pd.DataFrame([test_dict])
    pred_idx = best_model.predict(test_df)[0]
    pred_class = le.inverse_transform([pred_idx])[0]
    proba = best_model.predict_proba(test_df)[0]
    conf = {c: f"{p*100:.1f}%" for c, p in zip(le.classes_, proba)}
    print(f"  {label:<12} → Pred: {pred_class:15s} Confidence: {conf}")

quick_test("Ready", {
    'shoot_height_cm': 155, 'trunk_circumference_cm': 4.2, 'shoot_age_months': 20, 
    'num_leaves': 18, 'ccgi_score': 4.5, 'leaf_color': 'brownish green', 
    'bark_color': 'dark brown', 'bark_texture': 'rough and peeling', 'straightness': 'very straight'
})

quick_test("Not Ready", {
    'shoot_height_cm': 90, 'trunk_circumference_cm': 1.9, 'shoot_age_months': 9, 
    'num_leaves': 8, 'ccgi_score': 0.5, 'leaf_color': 'bright green', 
    'bark_color': 'green', 'bark_texture': 'smooth and soft', 'straightness': 'curved'
})