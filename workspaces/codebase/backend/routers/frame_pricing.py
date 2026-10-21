"""Backend-controlled Printovera pricing engine for wall art and photo prints."""
from typing import Dict, Optional, Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, FieldValidationInfo

from core import db, get_current_admin, get_settings_doc

router = APIRouter(tags=["frame-pricing"])

DEFAULTS = {
    "moulding_rates_per_inch": {"Black": 20.0, "Natural oak": 24.0, "Walnut": 28.0, "Gold": 30.0, "White": 20.0, "Silver": 26.0},
    "frame_sizes": ["4x6", "5x7", "6x4", "6x8", "8x10", "12x15", "12x18", "16x20", "18x24", "20x30", "24x36", "24x49"],
    "moulding_size_availability": {
        "Black": ["4x6", "5x7", "6x4", "6x8", "8x10", "12x15", "12x18", "16x20", "18x24", "20x30", "24x36", "24x49"],
        "Natural oak": ["4x6", "5x7", "6x4", "6x8", "8x10", "12x15", "12x18", "16x20", "18x24", "20x30"],
        "Walnut": ["5x7", "6x4", "6x8", "8x10", "12x15", "12x18", "16x20", "18x24", "20x30"],
        "Gold": ["4x6", "5x7", "6x4", "6x8", "8x10", "12x15", "12x18", "16x20", "18x24"],
        "White": ["4x6", "5x7", "6x4", "6x8", "8x10", "12x15", "12x18", "16x20", "18x24", "20x30"],
        "Silver": ["4x6", "5x7", "6x4", "6x8", "8x10", "12x15", "12x18", "16x20", "18x24", "20x30"]
    },
    "glass_per_sqft": 100.0,
    "manufacturing_per_sqft": 80.0,
    "print_rates_per_sqft": {"Photo paper": 60.0, "Canvas": 180.0, "Acrylic print": 220.0},
    "finish_rates_per_sqft": {"Gloss": 15.0, "Matte": 25.0, "Lustre": 20.0, "Textured canvas": 35.0, "None": 0.0},
    "backing_per_sqft": 20.0,
    "wastage_percent": 10.0,
    "profit_margin_percent": 30.0,
    "pricing_gst_percent": 18.0,
    "glass_enabled": True,
    "backing_enabled": True,
}

class PricingSettings(BaseModel):
    frame_sizes: list[str] = Field(default_factory=lambda: DEFAULTS["frame_sizes"])
    moulding_size_availability: Dict[str, list[str]] = Field(default_factory=lambda: DEFAULTS["moulding_size_availability"])
    moulding_rates_per_inch: Dict[str, float] = Field(default_factory=lambda: DEFAULTS["moulding_rates_per_inch"])
    glass_per_sqft: float = 100
    manufacturing_per_sqft: float = 80
    print_rates_per_sqft: Dict[str, float] = Field(default_factory=lambda: DEFAULTS["print_rates_per_sqft"])
    finish_rates_per_sqft: Dict[str, float] = Field(default_factory=lambda: DEFAULTS["finish_rates_per_sqft"])
    backing_per_sqft: float = 20
    wastage_percent: float = 10
    profit_margin_percent: float = 30
    pricing_gst_percent: float = 18
    glass_enabled: bool = True
    backing_enabled: bool = True

    @field_validator("frame_sizes")
    @classmethod
    def valid_frame_sizes(cls, values):
        if not values or any(not str(v).strip() for v in values):
            raise ValueError("At least one valid frame size is required")
        return list(dict.fromkeys(values))

    @field_validator("moulding_size_availability")
    @classmethod
    def valid_moulding_sizes(cls, values):
        for moulding, sizes in values.items():
            if not str(moulding).strip():
                raise ValueError("Moulding names cannot be empty")
            if any(not isinstance(size, str) or not size.strip() for size in sizes):
                raise ValueError("Moulding sizes must be valid size names")
        return values

    @field_validator("glass_per_sqft", "manufacturing_per_sqft", "backing_per_sqft")
    @classmethod
    def nonnegative_rates(cls, v):
        if v < 0:
            raise ValueError("Rates cannot be negative")
        return v

    @field_validator("wastage_percent", "profit_margin_percent", "pricing_gst_percent")
    @classmethod
    def valid_percent(cls, v, info: FieldValidationInfo):
        max_value = 99 if info.field_name == "profit_margin_percent" else 100
        if v < 0 or v > max_value:
            raise ValueError(f"{info.field_name} must be between 0 and {max_value}")
        return v

    @field_validator("moulding_rates_per_inch", "print_rates_per_sqft", "finish_rates_per_sqft")
    @classmethod
    def valid_rate_map(cls, values):
        if any(not str(k).strip() or float(v) < 0 for k, v in values.items()):
            raise ValueError("Rate names must be non-empty and rates cannot be negative")
        return values

class PriceRequest(BaseModel):
    size_label: Optional[str] = None
    width_in: float = Field(gt=0, le=120)
    height_in: float = Field(gt=0, le=120)
    product_type: Literal["framed_photo", "canvas_print", "photo_print", "acrylic_photo"] = "framed_photo"
    moulding: Optional[str] = "Black"
    print_material: str = "Photo paper"
    finish: str = "Gloss"
    include_glass: Optional[bool] = None
    include_backing: Optional[bool] = None
    quantity: int = Field(default=1, ge=1, le=10000)

async def _settings():
    doc = await get_settings_doc()
    return {**DEFAULTS, **{k: doc[k] for k in DEFAULTS if k in doc}}

@router.get("/pricing/frame-options")
async def get_public_frame_options():
    cfg = await _settings()
    return {"frame_sizes": cfg["frame_sizes"], "moulding_size_availability": cfg["moulding_size_availability"], "moulding_rates_per_inch": cfg["moulding_rates_per_inch"]}

@router.get("/pricing/frame-settings")
async def get_frame_pricing_settings(admin: dict = Depends(get_current_admin)):
    return {"pricing": await _settings()}

@router.put("/pricing/frame-settings")
async def update_frame_pricing_settings(payload: PricingSettings, admin: dict = Depends(get_current_admin)):
    update = payload.dict()
    await db.settings.update_one({"id": "default"}, {"$set": update}, upsert=True)
    return {"pricing": await _settings()}

@router.post("/pricing/frame-calculate")
async def calculate_frame_price(payload: PriceRequest):
    cfg = await _settings()
    width, height = payload.width_in, payload.height_in
    area = (width * height) / 144.0
    perimeter = 2 * (width + height)
    is_frame = payload.product_type == "framed_photo"
    use_glass = is_frame and (cfg["glass_enabled"] if payload.include_glass is None else payload.include_glass)
    use_backing = is_frame and (cfg["backing_enabled"] if payload.include_backing is None else payload.include_backing)
    moulding_rate = float(cfg["moulding_rates_per_inch"].get(payload.moulding or "", 0)) if is_frame else 0.0
    if is_frame and payload.moulding not in cfg["moulding_rates_per_inch"]:
        raise HTTPException(400, "Selected moulding has no backend price configured")
    if payload.print_material not in cfg["print_rates_per_sqft"]:
        raise HTTPException(400, "Selected print material has no backend price configured")
    if payload.finish not in cfg["finish_rates_per_sqft"]:
        raise HTTPException(400, "Selected finish has no backend price configured")
    moulding_cost = perimeter * moulding_rate
    glass_cost = area * float(cfg["glass_per_sqft"]) if use_glass else 0.0
    manufacturing_cost = area * float(cfg["manufacturing_per_sqft"])
    print_cost = area * float(cfg["print_rates_per_sqft"][payload.print_material])
    finish_cost = area * float(cfg["finish_rates_per_sqft"][payload.finish])
    backing_cost = area * float(cfg["backing_per_sqft"]) if use_backing else 0.0
    material_subtotal = moulding_cost + glass_cost + print_cost + finish_cost + backing_cost
    wastage_cost = material_subtotal * float(cfg["wastage_percent"]) / 100.0
    production_cost = material_subtotal + wastage_cost + manufacturing_cost
    margin = float(cfg["profit_margin_percent"]) / 100.0
    selling_before_tax = production_cost / (1.0 - margin) if margin else production_cost
    tax = selling_before_tax * float(cfg["pricing_gst_percent"]) / 100.0
    unit_total = round(selling_before_tax + tax, 2)
    return {
        "currency": "INR", "quantity": payload.quantity,
        "dimensions_in": {"width": width, "height": height},
        "area_sqft": round(area, 4), "perimeter_in": round(perimeter, 2),
        "breakdown_per_unit": {
            "moulding": round(moulding_cost, 2), "glass": round(glass_cost, 2),
            "manufacturing": round(manufacturing_cost, 2), "print": round(print_cost, 2),
            "finish": round(finish_cost, 2), "backing": round(backing_cost, 2),
            "wastage": round(wastage_cost, 2), "production_cost": round(production_cost, 2),
            "selling_before_tax": round(selling_before_tax, 2), "tax": round(tax, 2),
            "unit_total": unit_total,
        },
        "total": round(unit_total * payload.quantity, 2),
        "pricing_configured": True,
    }
