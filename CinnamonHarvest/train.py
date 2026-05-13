import pandas as pd
import numpy as np
from sklearn.preprocessing import OrdinalEncoder, LabelEncoder
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier, VotingClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
import joblib

# ─── Step 1 · Load dataset ────────────────────────────────────────────────────
df = pd.read_csv('Cinnamon_Harvest_Data.csv')
print("Total rows:", len(df))
print("Columns:", df.columns.tolist())
print()
print("harvest_readiness distribution:")
print(df['harvest_readiness'].value_counts())

# ─── Step 2 · Feature columns ────────────────────────────────────────────────
# Ordinal order matters — low → high maturity
leaf_order     = ['bright green', 'dark green', 'yellowish green', 'brownish green']
bark_col_order = ['green', 'light brown', 'medium brown', 'dark brown']
bark_tex_order = ['smooth and soft', 'slightly rough', 'rough and peeling']
straight_order = ['curved', 'slightly straight', 'very straight']

cat_cols = ['leaf_color', 'bark_color', 'bark_texture', 'straightness']
num_cols = ['shoot_height_cm', 'trunk_circumference_cm', 'shoot_age_months', 'num_leaves']

# ─── Step 3 · Dataset medians  ──────────
medians = df[num_cols].median()
print("\nDataset medians (reference — NOT used for silent imputation):")
for col, val in medians.items():
    print(f"  {col:<30} {val}")

# ─── Step 4 · Encode ──────────────────────────────────────────────────────────
enc = OrdinalEncoder(
    categories=[leaf_order, bark_col_order, bark_tex_order, straight_order],
    handle_unknown='use_encoded_value',
    unknown_value=-1
)
X_cat = enc.fit_transform(df[cat_cols])
X_num = df[num_cols].values
X     = np.hstack([X_num, X_cat])

le = LabelEncoder()
y  = le.fit_transform(df['harvest_readiness'])
print("\nClasses:", le.classes_)
print("X shape:", X.shape)

# ─── Step 5 · Split ───────────────────────────────────────────────────────────
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)
print(f"\nTraining rows: {len(X_train)}")
print(f"Testing rows:  {len(X_test)}")

# ─── Step 6 · Train ensemble ──────────────────────────────────────────────────
print("\nTraining model, please wait...")

gb = GradientBoostingClassifier(
    n_estimators=300, max_depth=4, learning_rate=0.05,
    min_samples_leaf=4, subsample=0.85, max_features='sqrt', random_state=42
)
rf = RandomForestClassifier(
    n_estimators=200, max_depth=7, min_samples_leaf=4,
    max_features='sqrt', random_state=42, n_jobs=-1
)
model = VotingClassifier(
    estimators=[('gb', gb), ('rf', rf)],
    voting='soft', weights=[2, 1]
)
model.fit(X_train, y_train)
print("Training complete!")

# ─── Step 7 · Evaluate ────────────────────────────────────────────────────────
y_pred = model.predict(X_test)
acc    = accuracy_score(y_test, y_pred)
print(f"\nTest Accuracy: {acc:.1%}")
print()
print(classification_report(y_test, y_pred, target_names=le.classes_))
print("Confusion matrix (rows=actual, cols=predicted):")
print(le.classes_)
print(confusion_matrix(y_test, y_pred))

skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=99)
cv  = cross_val_score(model, X, y, cv=skf)
print(f"\n5-Fold Stratified CV: {cv.mean():.1%} ± {cv.std():.1%}")
print(f"Per-fold: {[f'{v:.1%}' for v in cv]}")

# ─── Step 8 · Feature importance (GB sub-model) ───────────────────────────────
feat_names = num_cols + cat_cols
gb_model   = model.estimators_[0]
print("\nFeature Importances (from GB):")
for name, imp in sorted(zip(feat_names, gb_model.feature_importances_), key=lambda x: -x[1]):
    bar = '█' * int(imp * 60)
    print(f"  {name:<30} {imp:.4f}  {bar}")

# ─── Step 9 · Sanity checks ───────────────────────────────────────────────────
print("\n── Sanity checks ──")

def quick_test(label, num_vals, cat_vals):
    X_cat_t = enc.transform([cat_vals])
    X_t     = np.hstack([np.array([num_vals]), X_cat_t])
    pred    = le.inverse_transform(model.predict(X_t))[0]
    proba   = model.predict_proba(X_t)[0]
    conf    = {c: f"{p*100:.0f}%" for c, p in zip(le.classes_, proba)}
    print(f"  {label:<52} → {pred:14s} {conf}")

quick_test("Ready:      h=155, t=4.2, age=20, l=18",
    [155, 4.2, 20, 18],
    ['brownish green', 'dark brown', 'rough and peeling', 'very straight'])

quick_test("Borderline: h=130, t=2.9, age=13, l=14",
    [130, 2.9, 13, 14],
    ['dark green', 'medium brown', 'slightly rough', 'slightly straight'])

quick_test("Not Ready:  h=90, t=1.9, age=9, l=8",
    [90, 1.9, 9, 8],
    ['bright green', 'green', 'smooth and soft', 'curved'])

# ─── Step 10 · Save artefacts ─────────────────────────────────────────────────
joblib.dump(model,             'cinnamon_model.pkl')
joblib.dump(le,                'cinnamon_label_encoder.pkl')
joblib.dump(enc,               'cinnamon_ordinal_encoder.pkl')
joblib.dump(num_cols,          'cinnamon_num_cols.pkl')
joblib.dump(medians.to_dict(), 'cinnamon_medians.pkl')

print("\n✅  5 .pkl files saved.")
print("Target classes:", list(le.classes_))
 