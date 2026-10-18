# ML methodology
1. Data: Pima Indians Diabetes dataset (check licence at the download page). Features: Glucose, BloodPressure (diastolic), BMI, Age. Target: Outcome.
2. Cleaning: zeros in Glucose, BloodPressure and BMI mean "not measured" and become missing; median imputation inside the saved pipeline.
3. Split: stratified 70/15/15, seed 42. One row per person, so row-level splitting does not leak; split by participant if repeats are added.
4. Models: Logistic Regression (interpretable baseline), Decision Tree, Random Forest; optional small neural network (`extras.py`).
5. Selection on validation ROC-AUC; metrics reported once on the held-out test set: accuracy, precision, recall, specificity, F1, ROC-AUC, PR-AUC, confusion matrix; 5-fold CV on training data.
6. Explainability: permutation importance (optional SHAP). Shows model reliance, not causation.
7. Serving: preprocessing and model saved together; assessment returns a score only if the model is not synthetic and required inputs exist.
Limitations: different population from rural Jharkhand, small sample, uncalibrated score, not a diagnosis.
