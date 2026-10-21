"""Admin-configurable print pricing for commercial print products.

Pricing tables live in the existing settings document. Excel import accepts a workbook
whose first sheet has columns: category, size, paper_gsm, print_type, lamination,
sides, quantity, unit_cost, setup_cost, wastage_percent, profit_margin_percent, gst_percent.
"""
import csv
import io
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from core import db, get_current_admin, get_settings_doc

router = APIRouter(prefix="/pricing/printing", tags=["printing-pricing"])

DEFAULTS: Dict[str, Any] = {
    "products": ["Visiting Cards", "Brochures", "Letterheads", "Wedding Cards", "Photo Prints"],
    "paper_gsm_options": [80, 100, 120, 130, 170, 200, 250, 300, 350, 400],
    "print_types": ["Digital", "UV", "Offset", "Eco-solvent"],
    "lamination_options": ["None", "Gloss", "Matte", "Soft-touch"],
    "side_options": ["Single-sided", "Double-sided"],
    "quantity_breaks": [1, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    "rules": [
        {"category": "Visiting Cards", "size": "3.5x2 in", "paper_gsm": 300, "print_type": "Digital", "lamination": "None", "sides": "Single-sided", "min_quantity": 100, "max_quantity": 249, "unit_cost": 2.0, "setup_cost": 100, "wastage_percent": 5, "profit_margin_percent": 30, "gst_percent": 18},
        {"category": "Visiting Cards", "size": "3.5x2 in", "paper_gsm": 300, "print_type": "Digital", "lamination": "None", "sides": "Single-sided", "min_quantity": 250, "max_quantity": 499, "unit_cost": 1.5, "setup_cost": 100, "wastage_percent": 5, "profit_margin_percent": 30, "gst_percent": 18},
        {"category": "Visiting Cards", "size": "3.5x2 in", "paper_gsm": 300, "print_type": "Digital", "lamination": "Gloss", "sides": "Double-sided", "min_quantity": 100, "max_quantity": 249, "unit_cost": 3.5, "setup_cost": 150, "wastage_percent": 5, "profit_margin_percent": 30, "gst_percent": 18},
    ],
}
KEY = "printing_pricing_settings"


def _settings() -> Dict[str, Any]:
    doc = db.settings.find_one({"_id": KEY}) or {}
    return {**DEFAULTS, **doc.get("value", {})}


def _num(row: Dict[str, Any], key: str, default: float) -> float:
    value = row.get(key, default)
    try:
        n = float(value if value not in (None, "") else default)
        if n < 0:
            raise ValueError()
        return n
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"Invalid numeric value for {key}")


class PrintQuote(BaseModel):
    category: str
    size: str
    paper_gsm: int = Field(gt=0)
    print_type: str
    lamination: str = "None"
    sides: str = "Single-sided"
    quantity: int = Field(gt=0, le=1000000)


class PrintSettings(BaseModel):
    products: List[str] = Field(default_factory=list)
    paper_gsm_options: List[int] = Field(default_factory=list)
    print_types: List[str] = Field(default_factory=list)
    lamination_options: List[str] = Field(default_factory=list)
    side_options: List[str] = Field(default_factory=list)
    quantity_breaks: List[int] = Field(default_factory=list)
    rules: List[Dict[str, Any]] = Field(default_factory=list)


@router.get("/options")
async def options():
    cfg = _settings()
    return {k: cfg[k] for k in ("products", "paper_gsm_options", "print_types", "lamination_options", "side_options", "quantity_breaks")}


@router.get("/settings")
async def get_print_settings(admin=Depends(get_current_admin)):
    return {"pricing": _settings()}


@router.put("/settings")
async def update_print_settings(payload: PrintSettings, admin=Depends(get_current_admin)):
    cfg = payload.model_dump()
    # Validate every pricing row before saving; reject negative prices and invalid quantity ranges.
    for i, row in enumerate(cfg["rules"]):
        for field in ("unit_cost", "setup_cost", "wastage_percent", "profit_margin_percent", "gst_percent"):
            _num(row, field, 0)
        low, high = int(row.get("min_quantity", 1)), int(row.get("max_quantity", 1000000))
        if low < 1 or high < low:
            raise HTTPException(status_code=400, detail=f"Rule {i + 1}: invalid quantity range")
        if float(row.get("profit_margin_percent", 0)) >= 100:
            raise HTTPException(status_code=400, detail=f"Rule {i + 1}: profit margin must be below 100%")
    db.settings.update_one({"_id": KEY}, {"$set": {"value": cfg}}, upsert=True)
    return {"ok": True, "pricing": cfg}


@router.post("/calculate")
async def calculate_print_price(payload: PrintQuote):
    cfg = _settings()
    matches = [r for r in cfg.get("rules", []) if
        str(r.get("category", "")).casefold() == payload.category.casefold()
        and str(r.get("size", "")).casefold() == payload.size.casefold()
        and int(r.get("paper_gsm", 0)) == payload.paper_gsm
        and str(r.get("print_type", "")).casefold() == payload.print_type.casefold()
        and str(r.get("lamination", "None")).casefold() == payload.lamination.casefold()
        and str(r.get("sides", "Single-sided")).casefold() == payload.sides.casefold()
        and int(r.get("min_quantity", 1)) <= payload.quantity <= int(r.get("max_quantity", 1000000))]
    if not matches:
        raise HTTPException(status_code=404, detail="No price rule matches this product configuration and quantity. Ask the admin to add a matching rule.")
    rule = matches[0]
    unit_cost = _num(rule, "unit_cost", 0)
    setup_cost = _num(rule, "setup_cost", 0)
    wastage = _num(rule, "wastage_percent", 0)
    margin = _num(rule, "profit_margin_percent", 0)
    gst = _num(rule, "gst_percent", 0)
    production = unit_cost * payload.quantity * (1 + wastage / 100) + setup_cost
    before_tax = production / (1 - margin / 100) if margin else production
    tax = before_tax * gst / 100
    return {
        "currency": "INR", "quantity": payload.quantity, "configuration": payload.model_dump(),
        "matched_rule": {k: rule.get(k) for k in ("min_quantity", "max_quantity", "unit_cost", "setup_cost", "wastage_percent", "profit_margin_percent", "gst_percent")},
        "breakdown": {"unit_cost": round(unit_cost, 2), "print_subtotal": round(unit_cost * payload.quantity, 2),
            "wastage": round(unit_cost * payload.quantity * wastage / 100, 2), "setup_cost": round(setup_cost, 2),
            "production_cost": round(production, 2), "selling_before_tax": round(before_tax, 2),
            "gst": round(tax, 2), "total": round(before_tax + tax, 2),
            "effective_price_per_piece": round((before_tax + tax) / payload.quantity, 2)}
    }


@router.post("/import")
async def import_print_price_excel(file: UploadFile = File(...), admin=Depends(get_current_admin)):
    """Import .xlsx/.xlsm or CSV pricing table. Existing rules are replaced only after validation."""
    name = (file.filename or "").lower()
    raw = await file.read()
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Pricing file must be 5 MB or smaller")
    try:
        if name.endswith(".csv"):
            rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
        elif name.endswith((".xlsx", ".xlsm")):
            from openpyxl import load_workbook
            workbook = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
            sheet = workbook.active
            values = sheet.iter_rows(values_only=True)
            headers = [str(v).strip().lower() if v is not None else "" for v in next(values)]
            rows = [dict(zip(headers, row)) for row in values if any(v is not None for v in row)]
            workbook.close()
        else:
            raise HTTPException(status_code=400, detail="Upload an .xlsx, .xlsm, or .csv file")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read pricing workbook: {exc}")
    aliases = {"gsm": "paper_gsm", "one_side": "sides", "quantity_min": "min_quantity", "quantity_max": "max_quantity", "price_per_unit": "unit_cost", "setup_fee": "setup_cost", "margin_percent": "profit_margin_percent"}
    cleaned = []
    required = ("category", "size", "paper_gsm", "print_type", "lamination", "sides", "min_quantity", "unit_cost")
    for index, source in enumerate(rows, start=2):
        row = {aliases.get(str(k).strip().lower(), str(k).strip().lower()): v for k, v in source.items() if k is not None}
        if not any(v not in (None, "") for v in row.values()):
            continue
        missing = [k for k in required if row.get(k) in (None, "")]
        if missing:
            raise HTTPException(status_code=400, detail=f"Row {index} missing columns/values: {', '.join(missing)}")
        try:
            row["paper_gsm"] = int(row["paper_gsm"])
            row["min_quantity"] = int(row["min_quantity"])
            row["max_quantity"] = int(row.get("max_quantity") or 1000000)
            for k in ("unit_cost", "setup_cost", "wastage_percent", "profit_margin_percent", "gst_percent"):
                row[k] = float(row.get(k) or 0)
            if row["paper_gsm"] <= 0 or row["min_quantity"] <= 0 or row["max_quantity"] < row["min_quantity"]:
                raise ValueError()
            if row["unit_cost"] < 0 or row["setup_cost"] < 0 or not 0 <= row["profit_margin_percent"] < 100:
                raise ValueError()
            row["lamination"] = str(row.get("lamination") or "None")
            row["sides"] = str(row.get("sides") or "Single-sided")
            cleaned.append(row)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"Row {index} contains invalid numeric values")
    if not cleaned:
        raise HTTPException(status_code=400, detail="No valid pricing rows found in the file")
    cfg = _settings()
    cfg["rules"] = cleaned
    db.settings.update_one({"_id": KEY}, {"$set": {"value": cfg}}, upsert=True)
    return {"ok": True, "imported_rows": len(cleaned), "pricing": cfg}
