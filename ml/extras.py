"""Optional extensions: small neural network baseline (scikit-learn MLP) and SHAP importance.
Usage: python extras.py --data diabetes.csv   |   python extras.py --synthetic
Neural nets are NOT assumed better: compare against the baselines from train.py."""
import argparse, json
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.neural_network import MLPClassifier
from train import synthetic, load, metrics, FEATURES, TARGET, SEED, OUT

ap = argparse.ArgumentParser(); ap.add_argument("--data"); ap.add_argument("--synthetic", action="store_true")
a = ap.parse_args()
if not a.data and not a.synthetic:
    ap.error("give --data CSV or --synthetic")
d = synthetic() if a.synthetic else load(a.data)
X, y = d[FEATURES], d[TARGET]
Xtr, Xtmp, ytr, ytmp = train_test_split(X, y, test_size=0.30, stratify=y, random_state=SEED)
Xva, Xte, yva, yte = train_test_split(Xtmp, ytmp, test_size=0.50, stratify=ytmp, random_state=SEED)
nn = Pipeline([("imp", SimpleImputer(strategy="median")), ("sc", StandardScaler()),
               ("m", MLPClassifier((16, 8), alpha=1e-2, early_stopping=True, max_iter=500, random_state=SEED))])
nn.fit(Xtr, ytr)
res = {"model": "mlp_16_8", "synthetic": a.synthetic, "validation": metrics(yva, nn.predict(Xva), nn.predict_proba(Xva)[:, 1]),
       "test": metrics(yte, nn.predict(Xte), nn.predict_proba(Xte)[:, 1]),
       "note": "Compare with baselines in metrics.json; small tabular data rarely favours neural networks."}
OUT.mkdir(exist_ok=True)
(OUT / "neural_net_metrics.json").write_text(json.dumps(res, indent=2))
print("MLP test ROC-AUC:", round(res["test"]["roc_auc"], 3), "synthetic:", a.synthetic)
try:
    import shap, joblib
    pipe = joblib.load(OUT / "model.joblib")["pipeline"]
    f = lambda arr: pipe.predict_proba(pd.DataFrame(arr, columns=FEATURES))[:, 1]
    sv = shap.Explainer(f, Xtr.sample(min(100, len(Xtr)), random_state=SEED))(Xte.iloc[:50])
    imp = dict(zip(FEATURES, [float(abs(c).mean()) for c in sv.values.T]))
    (OUT / "shap_importance.json").write_text(json.dumps({"mean_abs_shap": imp, "caveat": "Model attribution, not causation"}, indent=2))
    print("SHAP saved:", imp)
except ImportError:
    print("shap not installed (pip install shap) - skipped")
except FileNotFoundError:
    print("Run train.py first so models/model.joblib exists - SHAP skipped")
