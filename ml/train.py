"""Train baseline models and save real held-out metrics.
Usage:
  python train.py --data diabetes.csv     # Pima Indians Diabetes CSV (columns: Glucose,BloodPressure,BMI,Age,Outcome,...)
  python train.py --synthetic             # synthetic demo only; output is flagged and never shown as validated
"""
import argparse, json, time
from pathlib import Path
import numpy as np, pandas as pd, joblib
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.metrics import (confusion_matrix, precision_score, recall_score, f1_score, accuracy_score,
                             roc_auc_score, average_precision_score)

FEATURES = ["Glucose", "BloodPressure", "BMI", "Age"]
TARGET = "Outcome"
SEED = 42
OUT = Path(__file__).parent / "models"


def synthetic(n=800):
    r = np.random.default_rng(SEED)
    d = pd.DataFrame({"Age": r.integers(21, 80, n), "BMI": r.normal(27, 5, n).clip(15, 50),
                      "Glucose": r.normal(115, 30, n).clip(50, 250), "BloodPressure": r.normal(72, 11, n).clip(40, 120)})
    z = 0.04 * (d.Glucose - 115) + 0.05 * (d.BMI - 27) + 0.02 * (d.Age - 45) - 0.8 + r.normal(0, 1, n)
    d[TARGET] = (z > 0).astype(int)
    return d


def load(path):
    d = pd.read_csv(path)
    miss = [c for c in FEATURES + [TARGET] if c not in d.columns]
    if miss:
        raise SystemExit(f"CSV is missing columns {miss}. Found: {list(d.columns)}. Expected Pima-style names: {FEATURES + [TARGET]}")
    for c in ["Glucose", "BloodPressure", "BMI"]:   # in the Pima data a 0 means "not measured", not a real value
        d.loc[d[c] == 0, c] = np.nan
    return d[FEATURES + [TARGET]]


def metrics(y, p, prob):
    tn, fp, fn, tp = confusion_matrix(y, p).ravel()
    return {"n": int(len(y)), "positives": int(y.sum()), "accuracy": accuracy_score(y, p),
            "precision": precision_score(y, p, zero_division=0), "recall_sensitivity": recall_score(y, p),
            "specificity": tn / (tn + fp), "f1": f1_score(y, p), "roc_auc": roc_auc_score(y, prob),
            "pr_auc": average_precision_score(y, prob), "confusion_matrix": [[int(tn), int(fp)], [int(fn), int(tp)]]}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--data"); ap.add_argument("--synthetic", action="store_true")
    a = ap.parse_args()
    if not a.data and not a.synthetic:
        ap.error("give --data CSV or --synthetic")
    is_syn = a.synthetic
    d = synthetic() if is_syn else load(a.data)
    X, y = d[FEATURES], d[TARGET]
    # one row per person in this dataset, so a stratified row split is leak-free. If you add repeated
    # records per participant, split by participant (GroupShuffleSplit) instead.
    Xtr, Xtmp, ytr, ytmp = train_test_split(X, y, test_size=0.30, stratify=y, random_state=SEED)
    Xva, Xte, yva, yte = train_test_split(Xtmp, ytmp, test_size=0.50, stratify=ytmp, random_state=SEED)
    models = {"logistic_regression": LogisticRegression(max_iter=1000),
              "decision_tree": DecisionTreeClassifier(max_depth=4, random_state=SEED),
              "random_forest": RandomForestClassifier(n_estimators=300, max_depth=6, random_state=SEED)}
    res, fitted = {}, {}
    for name, m in models.items():
        pipe = Pipeline([("imp", SimpleImputer(strategy="median")), ("sc", StandardScaler()), ("m", m)])
        t0 = time.time(); pipe.fit(Xtr, ytr); dur = time.time() - t0
        cv = cross_val_score(pipe, Xtr, ytr, cv=StratifiedKFold(5, shuffle=True, random_state=SEED), scoring="roc_auc")
        res[name] = {"train_seconds": round(dur, 3), "cv_roc_auc_mean": float(cv.mean()), "cv_roc_auc_std": float(cv.std()),
                     "validation": metrics(yva, pipe.predict(Xva), pipe.predict_proba(Xva)[:, 1]),
                     "test": metrics(yte, pipe.predict(Xte), pipe.predict_proba(Xte)[:, 1])}
        fitted[name] = pipe
    best = max(res, key=lambda k: res[k]["validation"]["roc_auc"])   # chosen on validation, reported on test
    imp = permutation_importance(fitted[best], Xte, yte, n_repeats=20, random_state=SEED, scoring="roc_auc")
    info = {"version": "v1-" + time.strftime("%Y%m%d"), "synthetic": is_syn, "best_model": best, "features": FEATURES,
            "target": "Outcome label of the source dataset (diabetes onset in Pima data)" if not is_syn else "synthetic outcome",
            "dataset": {"source": "synthetic generator (seed 42)" if is_syn else "Pima Indians Diabetes (record URL and licence from your download)",
                        "rows": int(len(d)), "split": "70/15/15 stratified, seed 42"},
            "test_metrics": res[best]["test"], "all_models": res,
            "permutation_importance_roc_auc": {f: {"mean": float(m), "std": float(s)} for f, m, s in zip(FEATURES, imp.importances_mean, imp.importances_std)},
            "limitations": ["Public dataset population differs from rural Jharkhand; generalisation is unknown",
                            "Small sample; wide uncertainty", "Score is uncalibrated and is not a diagnosis",
                            "Permutation importance shows model reliance, not causation"] +
                           (["SYNTHETIC DATA: metrics cannot indicate real-world performance"] if is_syn else [])}
    OUT.mkdir(exist_ok=True)
    joblib.dump({"pipeline": fitted[best], "features": FEATURES}, OUT / "model.joblib")
    (OUT / "metrics.json").write_text(json.dumps(info, indent=2))
    print(json.dumps({k: res[k]["test"]["roc_auc"] for k in res}, indent=1), "best:", best, "synthetic:", is_syn)


if __name__ == "__main__":
    main()
