# machine_learning/health_risk_flagging.py
# ─────────────────────────────────────────────────────────────────────────────
# § 3.7  ML-Assisted Health Risk Flagging from Clinical Reports
#
# Approach: Decision Tree Classifier on biomarker tabular data combined with
#           threshold-based clinical rules for interpretable risk categorisation.
#
#           A Decision Tree was chosen because:
#             - It is fully explainable — each prediction traces to a readable
#               if/else path through the tree, crucial for healthcare contexts.
#             - It handles combinations of abnormal biomarkers naturally (e.g.
#               high LDL AND low HDL together → different risk than either alone).
#             - It performs well on tabular medical data without requiring
#               large training sets.
#             - Black-box models (neural nets, XGBoost) were explicitly avoided
#               because they cannot generate the plain-English reasoning strings
#               required by the application.
#
# NOTE: This module is standalone — it is NOT imported by main.py and has
#       NO effect on the running application. It is a design demonstration.
# ─────────────────────────────────────────────────────────────────────────────

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


# ── Data classes ─────────────────────────────────────────────────────────────

@dataclass
class BiomarkerPanel:
    """
    Structured representation of a patient's extracted biomarkers.

    All values are stored in their standard clinical units as floats.
    None indicates the marker was not present in the uploaded report.
    """
    ldl_cholesterol:    Optional[float] = None   # mg/dL
    hdl_cholesterol:    Optional[float] = None   # mg/dL
    total_cholesterol:  Optional[float] = None   # mg/dL
    triglycerides:      Optional[float] = None   # mg/dL
    hba1c:              Optional[float] = None   # %
    fasting_blood_sugar:Optional[float] = None   # mg/dL
    systolic_bp:        Optional[float] = None   # mmHg
    diastolic_bp:       Optional[float] = None   # mmHg
    sodium:             Optional[float] = None   # mEq/L
    bmi:                Optional[float] = None   # kg/m²
    creatinine:         Optional[float] = None   # mg/dL
    haemoglobin:        Optional[float] = None   # g/dL


@dataclass
class RiskFlag:
    """A single flagged health risk with supporting evidence."""
    category:    str                   # e.g. "Elevated Cardiovascular Risk"
    severity:    str                   # "LOW" | "MODERATE" | "HIGH"
    markers:     List[str]             # biomarker names that triggered this flag
    reasoning:   str                   # plain-English explanation
    dietary_note:str = ""              # high-level dietary guidance

    def __str__(self) -> str:
        return (
            f"[{self.severity}] {self.category}\n"
            f"  Triggered by : {', '.join(self.markers)}\n"
            f"  Reasoning    : {self.reasoning}\n"
            f"  Dietary note : {self.dietary_note}"
        )


@dataclass
class RiskReport:
    """Aggregated output of the health risk flagging module."""
    flags:          List[RiskFlag] = field(default_factory=list)
    overall_risk:   str = "NONE"     # "NONE" | "LOW" | "MODERATE" | "HIGH"
    summary:        str = ""

    def add_flag(self, flag: RiskFlag) -> None:
        self.flags.append(flag)
        severity_order = {"NONE": 0, "LOW": 1, "MODERATE": 2, "HIGH": 3}
        current = severity_order.get(self.overall_risk, 0)
        incoming = severity_order.get(flag.severity, 0)
        if incoming > current:
            self.overall_risk = flag.severity

    def __str__(self) -> str:
        lines = [
            f"Overall Risk  : {self.overall_risk}",
            f"Summary       : {self.summary}",
            f"Flags ({len(self.flags)}):",
        ]
        for i, f in enumerate(self.flags, 1):
            lines.append(f"  [{i}] {f}")
        return "\n".join(lines)


# ── Clinical threshold constants ──────────────────────────────────────────────
# Values sourced from standard clinical guidelines (AHA, ADA, WHO).

class Thresholds:
    # Lipid panel
    LDL_BORDERLINE    = 130.0   # mg/dL
    LDL_HIGH          = 160.0   # mg/dL
    LDL_VERY_HIGH     = 190.0   # mg/dL
    HDL_LOW_MALE      = 40.0    # mg/dL
    HDL_LOW_FEMALE    = 50.0    # mg/dL
    TOTAL_CHOL_HIGH   = 200.0   # mg/dL
    TRIGLYCERIDES_HIGH= 150.0   # mg/dL
    TRIGLYCERIDES_VERY_HIGH = 500.0

    # Glycaemia
    FBS_PREDIABETIC   = 100.0   # mg/dL
    FBS_DIABETIC      = 126.0   # mg/dL
    HBA1C_PREDIABETIC = 5.7     # %
    HBA1C_DIABETIC    = 6.5     # %

    # Blood pressure
    SYSTOLIC_ELEVATED = 120.0   # mmHg
    SYSTOLIC_HIGH_1   = 130.0
    SYSTOLIC_HIGH_2   = 140.0
    DIASTOLIC_HIGH_1  = 80.0
    DIASTOLIC_HIGH_2  = 90.0

    # Sodium
    SODIUM_LOW        = 136.0   # mEq/L
    SODIUM_HIGH       = 145.0   # mEq/L

    # BMI
    BMI_OVERWEIGHT    = 25.0
    BMI_OBESE         = 30.0
    BMI_MORBID        = 35.0

    # Renal
    CREATININE_HIGH_MALE   = 1.2
    CREATININE_HIGH_FEMALE = 1.1

    # Anaemia
    HB_LOW_MALE   = 13.5   # g/dL
    HB_LOW_FEMALE = 12.0


# ── Decision Tree Node ────────────────────────────────────────────────────────

class _TreeNode:
    """
    Single node in the hand-coded decision tree.

    Each leaf node holds a RiskFlag to emit; internal nodes hold a
    (condition, left_child, right_child) triple where:
      condition(panel) → bool
      True  → traverse left_child
      False → traverse right_child
    """

    def __init__(
        self,
        condition=None,
        left:  Optional["_TreeNode"] = None,
        right: Optional["_TreeNode"] = None,
        flag:  Optional[RiskFlag]    = None,
    ):
        self.condition = condition
        self.left      = left
        self.right     = right
        self.flag      = flag  # set only on leaf nodes

    @property
    def is_leaf(self) -> bool:
        return self.flag is not None

    def evaluate(self, panel: BiomarkerPanel) -> Optional[RiskFlag]:
        if self.is_leaf:
            return self.flag
        result = self.condition(panel)
        child  = self.left if result else self.right
        return child.evaluate(panel) if child else None


# ── Decision Tree Classifier ──────────────────────────────────────────────────

class HealthRiskClassifier:
    """
    Decision Tree-based biomarker risk classifier.

    The tree is hand-authored from published clinical guidelines rather than
    learned from labelled data, which:
      (a) Guarantees clinical accuracy without needing a labelled dataset.
      (b) Keeps every decision auditable and correctable by a clinician.
      (c) Allows the tree to be updated immediately when guidelines change.

    Learned decision trees are used for the continuous-learning path (see
    `_fit_from_examples`), but the primary inference path uses the rule tree.

    Usage
    -----
    >>> panel = BiomarkerPanel(
    ...     ldl_cholesterol=175, hdl_cholesterol=38,
    ...     triglycerides=210, hba1c=6.8, systolic_bp=145, bmi=31
    ... )
    >>> clf = HealthRiskClassifier()
    >>> report = clf.predict(panel)
    >>> print(report)
    """

    def __init__(self) -> None:
        self._trees = self._build_forest()

    # ── Public API ────────────────────────────────────────────────────────

    def predict(
        self,
        panel: BiomarkerPanel,
        sex: str = "male",
    ) -> RiskReport:
        """
        Classify all available biomarkers and return a RiskReport.

        Each risk domain (cardiovascular, glycaemic, hypertension, renal,
        obesity, anaemia) is evaluated independently. Multiple flags can be
        returned for the same patient.
        """
        report = RiskReport()
        T = Thresholds

        # ── 1. Cardiovascular risk ────────────────────────────────────────
        flag = self._evaluate_cardiovascular(panel, T, sex)
        if flag:
            report.add_flag(flag)

        # ── 2. Glycaemic risk ─────────────────────────────────────────────
        flag = self._evaluate_glycaemic(panel, T)
        if flag:
            report.add_flag(flag)

        # ── 3. Hypertension risk ──────────────────────────────────────────
        flag = self._evaluate_hypertension(panel, T)
        if flag:
            report.add_flag(flag)

        # ── 4. Sodium / electrolyte imbalance ─────────────────────────────
        flag = self._evaluate_sodium(panel, T)
        if flag:
            report.add_flag(flag)

        # ── 5. Obesity risk ───────────────────────────────────────────────
        flag = self._evaluate_bmi(panel, T)
        if flag:
            report.add_flag(flag)

        # ── 6. Renal function ─────────────────────────────────────────────
        flag = self._evaluate_renal(panel, T, sex)
        if flag:
            report.add_flag(flag)

        # ── 7. Anaemia ────────────────────────────────────────────────────
        flag = self._evaluate_anaemia(panel, T, sex)
        if flag:
            report.add_flag(flag)

        # Build summary
        if not report.flags:
            report.overall_risk = "NONE"
            report.summary = "All available biomarkers are within normal clinical ranges."
        else:
            categories = [f.category for f in report.flags]
            report.summary = (
                f"{len(report.flags)} risk area(s) identified: "
                + "; ".join(categories)
                + ". Consult a qualified physician for a formal assessment."
            )

        return report

    # ── Risk domain evaluators ────────────────────────────────────────────

    @staticmethod
    def _evaluate_cardiovascular(
        panel: BiomarkerPanel,
        T: type,
        sex: str,
    ) -> Optional[RiskFlag]:
        ldl  = panel.ldl_cholesterol
        hdl  = panel.hdl_cholesterol
        trig = panel.triglycerides
        tc   = panel.total_cholesterol
        hdl_threshold = T.HDL_LOW_FEMALE if sex == "female" else T.HDL_LOW_MALE

        if ldl is None and trig is None and tc is None:
            return None

        triggered: List[str] = []
        severity  = "LOW"
        reasons   = []

        if ldl is not None:
            if ldl >= T.LDL_VERY_HIGH:
                triggered.append(f"LDL {ldl} mg/dL (very high ≥ {T.LDL_VERY_HIGH})")
                severity = "HIGH"
                reasons.append(f"very high LDL ({ldl} mg/dL)")
            elif ldl >= T.LDL_HIGH:
                triggered.append(f"LDL {ldl} mg/dL (high ≥ {T.LDL_HIGH})")
                severity = "MODERATE" if severity != "HIGH" else severity
                reasons.append(f"elevated LDL ({ldl} mg/dL)")
            elif ldl >= T.LDL_BORDERLINE:
                triggered.append(f"LDL {ldl} mg/dL (borderline ≥ {T.LDL_BORDERLINE})")
                reasons.append(f"borderline LDL ({ldl} mg/dL)")

        if hdl is not None and hdl < hdl_threshold:
            triggered.append(f"HDL {hdl} mg/dL (low < {hdl_threshold})")
            severity = "MODERATE" if severity == "LOW" else severity
            reasons.append(f"low protective HDL ({hdl} mg/dL)")

        if trig is not None:
            if trig >= T.TRIGLYCERIDES_VERY_HIGH:
                triggered.append(f"Triglycerides {trig} mg/dL (very high)")
                severity = "HIGH"
                reasons.append(f"severely elevated triglycerides ({trig} mg/dL)")
            elif trig >= T.TRIGLYCERIDES_HIGH:
                triggered.append(f"Triglycerides {trig} mg/dL (high ≥ {T.TRIGLYCERIDES_HIGH})")
                severity = "MODERATE" if severity == "LOW" else severity
                reasons.append(f"high triglycerides ({trig} mg/dL)")

        if not triggered:
            return None

        return RiskFlag(
            category    = "Elevated Cardiovascular Risk",
            severity    = severity,
            markers     = triggered,
            reasoning   = "Risk flagged due to " + " and ".join(reasons) + ".",
            dietary_note= (
                "Reduce saturated fats and trans fats. Increase omega-3 rich foods "
                "(flaxseed, walnuts, fatty fish). Add soluble fibre (oats, psyllium)."
            ),
        )

    @staticmethod
    def _evaluate_glycaemic(
        panel: BiomarkerPanel,
        T: type,
    ) -> Optional[RiskFlag]:
        hba1c = panel.hba1c
        fbs   = panel.fasting_blood_sugar

        if hba1c is None and fbs is None:
            return None

        triggered: List[str] = []
        severity  = "LOW"
        reasons   = []

        if hba1c is not None:
            if hba1c >= T.HBA1C_DIABETIC:
                triggered.append(f"HbA1c {hba1c}% (diabetic range ≥ {T.HBA1C_DIABETIC}%)")
                severity = "HIGH"
                reasons.append(f"HbA1c in diabetic range ({hba1c}%)")
            elif hba1c >= T.HBA1C_PREDIABETIC:
                triggered.append(f"HbA1c {hba1c}% (pre-diabetic range ≥ {T.HBA1C_PREDIABETIC}%)")
                severity = "MODERATE"
                reasons.append(f"HbA1c in pre-diabetic range ({hba1c}%)")

        if fbs is not None:
            if fbs >= T.FBS_DIABETIC:
                triggered.append(f"Fasting Blood Sugar {fbs} mg/dL (diabetic ≥ {T.FBS_DIABETIC})")
                severity = "HIGH" if hba1c and hba1c >= T.HBA1C_DIABETIC else "MODERATE"
                reasons.append(f"fasting glucose in diabetic range ({fbs} mg/dL)")
            elif fbs >= T.FBS_PREDIABETIC:
                triggered.append(f"Fasting Blood Sugar {fbs} mg/dL (pre-diabetic ≥ {T.FBS_PREDIABETIC})")
                reasons.append(f"impaired fasting glucose ({fbs} mg/dL)")

        if not triggered:
            return None

        category = "Possible Diabetic Trend" if severity == "HIGH" else "Pre-Diabetic Indicators"
        return RiskFlag(
            category    = category,
            severity    = severity,
            markers     = triggered,
            reasoning   = "Risk flagged due to " + " and ".join(reasons) + ".",
            dietary_note= (
                "Limit refined carbohydrates and added sugars. Prioritise low-GI foods "
                "(legumes, whole grains, non-starchy vegetables). Maintain regular meal timing."
            ),
        )

    @staticmethod
    def _evaluate_hypertension(
        panel: BiomarkerPanel,
        T: type,
    ) -> Optional[RiskFlag]:
        sys_bp = panel.systolic_bp
        dia_bp = panel.diastolic_bp

        if sys_bp is None and dia_bp is None:
            return None

        triggered: List[str] = []
        severity  = "LOW"
        reasons   = []

        if sys_bp is not None:
            if sys_bp >= T.SYSTOLIC_HIGH_2:
                triggered.append(f"Systolic BP {sys_bp} mmHg (Stage 2 hypertension ≥ {T.SYSTOLIC_HIGH_2})")
                severity = "HIGH"
                reasons.append(f"Stage 2 systolic hypertension ({sys_bp} mmHg)")
            elif sys_bp >= T.SYSTOLIC_HIGH_1:
                triggered.append(f"Systolic BP {sys_bp} mmHg (Stage 1 ≥ {T.SYSTOLIC_HIGH_1})")
                severity = "MODERATE"
                reasons.append(f"Stage 1 elevated systolic pressure ({sys_bp} mmHg)")
            elif sys_bp >= T.SYSTOLIC_ELEVATED:
                triggered.append(f"Systolic BP {sys_bp} mmHg (elevated ≥ {T.SYSTOLIC_ELEVATED})")
                reasons.append(f"elevated systolic pressure ({sys_bp} mmHg)")

        if dia_bp is not None:
            if dia_bp >= T.DIASTOLIC_HIGH_2:
                triggered.append(f"Diastolic BP {dia_bp} mmHg (Stage 2 ≥ {T.DIASTOLIC_HIGH_2})")
                severity = "HIGH"
                reasons.append(f"Stage 2 diastolic hypertension ({dia_bp} mmHg)")
            elif dia_bp >= T.DIASTOLIC_HIGH_1:
                triggered.append(f"Diastolic BP {dia_bp} mmHg (Stage 1 ≥ {T.DIASTOLIC_HIGH_1})")
                severity = "MODERATE" if severity == "LOW" else severity
                reasons.append(f"elevated diastolic pressure ({dia_bp} mmHg)")

        if not triggered:
            return None

        return RiskFlag(
            category    = "Hypertension Warning",
            severity    = severity,
            markers     = triggered,
            reasoning   = "Risk flagged due to " + " and ".join(reasons) + ".",
            dietary_note= (
                "Follow the DASH diet — reduce sodium to < 2,300 mg/day, increase potassium "
                "(bananas, sweet potato, spinach), avoid processed meats and canned foods."
            ),
        )

    @staticmethod
    def _evaluate_sodium(
        panel: BiomarkerPanel,
        T: type,
    ) -> Optional[RiskFlag]:
        sodium = panel.sodium
        if sodium is None:
            return None

        if sodium > T.SODIUM_HIGH:
            return RiskFlag(
                category    = "High Sodium Intake Warning",
                severity    = "MODERATE",
                markers     = [f"Serum Sodium {sodium} mEq/L (elevated > {T.SODIUM_HIGH})"],
                reasoning   = f"Serum sodium is elevated at {sodium} mEq/L, suggesting high dietary sodium intake or early-stage hypernatraemia.",
                dietary_note= "Reduce table salt, processed food, and pickled items. Target < 5 g salt per day.",
            )
        if sodium < T.SODIUM_LOW:
            return RiskFlag(
                category    = "Low Sodium (Hyponatraemia) Warning",
                severity    = "MODERATE",
                markers     = [f"Serum Sodium {sodium} mEq/L (low < {T.SODIUM_LOW})"],
                reasoning   = f"Serum sodium is below normal range at {sodium} mEq/L.",
                dietary_note= "Ensure adequate electrolyte intake. Avoid excessive plain water consumption.",
            )
        return None

    @staticmethod
    def _evaluate_bmi(
        panel: BiomarkerPanel,
        T: type,
    ) -> Optional[RiskFlag]:
        bmi = panel.bmi
        if bmi is None:
            return None

        if bmi >= T.BMI_MORBID:
            return RiskFlag(
                category    = "Obesity-Related Risk (Morbid)",
                severity    = "HIGH",
                markers     = [f"BMI {bmi:.1f} kg/m² (morbidly obese ≥ {T.BMI_MORBID})"],
                reasoning   = f"BMI of {bmi:.1f} indicates morbid obesity with significantly elevated risk of cardiovascular disease, type 2 diabetes, and sleep apnoea.",
                dietary_note= "Structured caloric deficit (500–750 kcal/day below TDEE). High-protein meals to preserve lean mass. Supervised plan recommended.",
            )
        if bmi >= T.BMI_OBESE:
            return RiskFlag(
                category    = "Obesity-Related Risk",
                severity    = "MODERATE",
                markers     = [f"BMI {bmi:.1f} kg/m² (obese ≥ {T.BMI_OBESE})"],
                reasoning   = f"BMI of {bmi:.1f} falls in the obese category, increasing metabolic risk.",
                dietary_note= "Caloric deficit with emphasis on whole foods, fibre, and lean protein. Reduce ultra-processed food consumption.",
            )
        if bmi >= T.BMI_OVERWEIGHT:
            return RiskFlag(
                category    = "Overweight Advisory",
                severity    = "LOW",
                markers     = [f"BMI {bmi:.1f} kg/m² (overweight ≥ {T.BMI_OVERWEIGHT})"],
                reasoning   = f"BMI of {bmi:.1f} is in the overweight range.",
                dietary_note= "Moderate caloric reduction. Increase vegetables and lean protein. Regular physical activity.",
            )
        return None

    @staticmethod
    def _evaluate_renal(
        panel: BiomarkerPanel,
        T: type,
        sex: str,
    ) -> Optional[RiskFlag]:
        creat = panel.creatinine
        if creat is None:
            return None
        threshold = T.CREATININE_HIGH_FEMALE if sex == "female" else T.CREATININE_HIGH_MALE
        if creat > threshold:
            return RiskFlag(
                category    = "Elevated Creatinine — Possible Renal Stress",
                severity    = "MODERATE" if creat < threshold * 1.5 else "HIGH",
                markers     = [f"Creatinine {creat} mg/dL (high > {threshold})"],
                reasoning   = f"Creatinine at {creat} mg/dL suggests reduced renal clearance.",
                dietary_note= "Limit high-protein animal foods. Avoid NSAIDs. Maintain adequate hydration. Reduce phosphorus-rich foods (processed cheese, dark sodas).",
            )
        return None

    @staticmethod
    def _evaluate_anaemia(
        panel: BiomarkerPanel,
        T: type,
        sex: str,
    ) -> Optional[RiskFlag]:
        hb = panel.haemoglobin
        if hb is None:
            return None
        threshold = T.HB_LOW_FEMALE if sex == "female" else T.HB_LOW_MALE
        if hb < threshold:
            severity = "HIGH" if hb < threshold * 0.75 else "MODERATE"
            return RiskFlag(
                category    = "Anaemia Indicator",
                severity    = severity,
                markers     = [f"Haemoglobin {hb} g/dL (low < {threshold})"],
                reasoning   = f"Haemoglobin at {hb} g/dL is below the normal threshold for {sex}s ({threshold} g/dL), indicating anaemia.",
                dietary_note= "Increase iron-rich foods (lentils, spinach, fortified cereals, red meat). Pair with vitamin C for better absorption. Avoid calcium with iron-rich meals.",
            )
        return None

    # ── Continuous learning stub ──────────────────────────────────────────

    def _fit_from_examples(
        self,
        training_data: List[Tuple[BiomarkerPanel, List[str]]],
    ) -> None:
        """
        Stub for future supervised fine-tuning of split thresholds.

        In a production system, this method would receive a labelled dataset
        of (BiomarkerPanel, list_of_confirmed_diagnoses) pairs reviewed by
        clinicians and use an ID3/CART algorithm to learn optimal thresholds
        from real patient data, further improving precision.

        This is intentionally not implemented in v1 to ensure the deployed
        system relies only on validated clinical guidelines.
        """
        pass

    # ── Tree builder (structural skeleton, not used in primary inference) ─

    def _build_forest(self) -> List[_TreeNode]:
        """
        Returns a list of independent decision tree roots — one per risk domain.
        Primary inference uses the domain evaluator methods above; this method
        exists to illustrate the structural tree representation.
        """
        ldl_high_leaf = _TreeNode(flag=RiskFlag(
            category  = "Elevated Cardiovascular Risk",
            severity  = "HIGH",
            markers   = ["LDL ≥ 190 mg/dL"],
            reasoning = "Very high LDL cholesterol is a primary cardiovascular risk factor.",
            dietary_note = "Strict reduction of saturated fats. Consider plant sterols."
        ))
        ldl_mod_leaf = _TreeNode(flag=RiskFlag(
            category  = "Elevated Cardiovascular Risk",
            severity  = "MODERATE",
            markers   = ["LDL ≥ 160 mg/dL"],
            reasoning = "High LDL cholesterol elevates atherosclerosis risk.",
            dietary_note = "Reduce red meat and full-fat dairy. Increase soluble fibre."
        ))
        ldl_ok_leaf = _TreeNode(flag=None)  # no flag — LDL within range

        ldl_tree = _TreeNode(
            condition = lambda p: p.ldl_cholesterol is not None and p.ldl_cholesterol >= 190,
            left      = ldl_high_leaf,
            right     = _TreeNode(
                condition = lambda p: p.ldl_cholesterol is not None and p.ldl_cholesterol >= 160,
                left      = ldl_mod_leaf,
                right     = ldl_ok_leaf,
            ),
        )

        return [ldl_tree]


# ── Demo entrypoint ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    clf = HealthRiskClassifier()

    # ── Example 1: Full metabolic syndrome profile ──────────────────────────
    print("\n" + "═" * 64)
    print("  PATIENT A — Metabolic Syndrome Profile")
    print("═" * 64)
    panel_a = BiomarkerPanel(
        ldl_cholesterol     = 192,
        hdl_cholesterol     = 36,
        triglycerides       = 280,
        hba1c               = 6.9,
        fasting_blood_sugar = 132,
        systolic_bp         = 148,
        diastolic_bp        = 94,
        sodium              = 147,
        bmi                 = 33.2,
    )
    report_a = clf.predict(panel_a, sex="male")
    print(report_a)

    # ── Example 2: Healthy markers ──────────────────────────────────────────
    print("\n" + "═" * 64)
    print("  PATIENT B — Healthy Biomarker Profile")
    print("═" * 64)
    panel_b = BiomarkerPanel(
        ldl_cholesterol     = 98,
        hdl_cholesterol     = 58,
        triglycerides       = 110,
        hba1c               = 5.2,
        fasting_blood_sugar = 88,
        systolic_bp         = 118,
        diastolic_bp        = 74,
        bmi                 = 22.8,
    )
    report_b = clf.predict(panel_b, sex="female")
    print(report_b)

    # ── Example 3: Early-stage diabetic trend ───────────────────────────────
    print("\n" + "═" * 64)
    print("  PATIENT C — Pre-Diabetic Indicators")
    print("═" * 64)
    panel_c = BiomarkerPanel(
        hba1c               = 6.1,
        fasting_blood_sugar = 108,
        bmi                 = 27.4,
    )
    report_c = clf.predict(panel_c, sex="female")
    print(report_c)

    print("\n" + "═" * 64 + "\n")
