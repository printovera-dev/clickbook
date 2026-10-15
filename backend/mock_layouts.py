"""Built-in 8x8 album photo-slot layouts traced from the supplied mock pages.

Coordinates are normalized to the full square page. These are geometry templates,
not fixed-image backgrounds, so customer photos remain the images rendered/printed.
"""
MOCK_LAYOUTS = [
    {
        "name": "Elegant Triptych Wide",
        "photo_count": 3,
        "positions": [
            {"x": 0.0, "y": 0.2334, "w": 0.3296, "h": 0.5337},
            {"x": 0.3345, "y": 0.2334, "w": 0.3311, "h": 0.5337},
            {"x": 0.6704, "y": 0.2334, "w": 0.3296, "h": 0.5337},
        ],
    },
    {
        "name": "Classic Triptych Compact",
        "photo_count": 3,
        "positions": [
            {"x": 0.0, "y": 0.2832, "w": 0.3213, "h": 0.4019},
            {"x": 0.3389, "y": 0.2832, "w": 0.3228, "h": 0.4019},
            {"x": 0.6782, "y": 0.2832, "w": 0.3218, "h": 0.4019},
        ],
    },
    {
        "name": "Garden Asymmetric Four",
        "photo_count": 4,
        "positions": [
            {"x": 0.0171, "y": 0.1348, "w": 0.4819, "h": 0.2812},
            {"x": 0.0171, "y": 0.4395, "w": 0.4819, "h": 0.2188},
            {"x": 0.0171, "y": 0.6821, "w": 0.4819, "h": 0.1831},
            {"x": 0.5186, "y": 0.1348, "w": 0.4814, "h": 0.7305},
        ],
    },
    {
        "name": "Editorial Four with Tall Right",
        "photo_count": 4,
        "positions": [
            {"x": 0.0610, "y": 0.0000, "w": 0.4146, "h": 0.3276},
            {"x": 0.0610, "y": 0.3652, "w": 0.4146, "h": 0.2402},
            {"x": 0.0610, "y": 0.6436, "w": 0.4146, "h": 0.3564},
            {"x": 0.5078, "y": 0.0000, "w": 0.4146, "h": 1.0000},
        ],
    },
    {
        "name": "Portrait Pair Mid-Band",
        "photo_count": 2,
        "positions": [
            {"x": 0.0342, "y": 0.2236, "w": 0.4390, "h": 0.5288},
            {"x": 0.5454, "y": 0.2236, "w": 0.4395, "h": 0.5288},
        ],
    },
    {
        "name": "Split Portrait and Family",
        "photo_count": 2,
        "positions": [
            {"x": 0.0000, "y": 0.0000, "w": 0.3198, "h": 1.0000},
            {"x": 0.3296, "y": 0.0000, "w": 0.6704, "h": 1.0000},
        ],
    },
    {
        "name": "Full-Height Triptych",
        "photo_count": 3,
        "positions": [
            {"x": 0.0000, "y": 0.0815, "w": 0.3345, "h": 0.7832},
            {"x": 0.3374, "y": 0.0815, "w": 0.3354, "h": 0.7832},
            {"x": 0.6748, "y": 0.0815, "w": 0.3252, "h": 0.7832},
        ],
    },
    {
        "name": "Framed Triptych Narrow",
        "photo_count": 3,
        "positions": [
            {"x": 0.0000, "y": 0.2603, "w": 0.3242, "h": 0.5454},
            {"x": 0.3315, "y": 0.2603, "w": 0.3364, "h": 0.5454},
            {"x": 0.6748, "y": 0.2603, "w": 0.3252, "h": 0.5454},
        ],
    },
    {
        "name": "Stacked Editorial Trio",
        "photo_count": 3,
        "positions": [
            {"x": 0.1523, "y": 0.0000, "w": 0.6948, "h": 0.2529},
            {"x": 0.1523, "y": 0.2749, "w": 0.6948, "h": 0.4033},
            {"x": 0.1523, "y": 0.7002, "w": 0.6948, "h": 0.2998},
        ],
    },
    {
        "name": "Minimal Triptych Strip",
        "photo_count": 3,
        "positions": [
            {"x": 0.0000, "y": 0.3394, "w": 0.3208, "h": 0.3213},
            {"x": 0.3398, "y": 0.3394, "w": 0.3203, "h": 0.3213},
            {"x": 0.6792, "y": 0.3394, "w": 0.3208, "h": 0.3213},
        ],
    },
    {
        "name": "Twin Portrait Panels",
        "photo_count": 2,
        "positions": [
            {"x": 0.0107, "y": 0.1431, "w": 0.4834, "h": 0.6929},
            {"x": 0.5059, "y": 0.1431, "w": 0.4834, "h": 0.6929},
        ],
    },
    {
        "name": "Wide Minimal Triptych",
        "photo_count": 3,
        "positions": [
            {"x": 0.0000, "y": 0.3750, "w": 0.3218, "h": 0.3218},
            {"x": 0.3320, "y": 0.3750, "w": 0.3213, "h": 0.3218},
            {"x": 0.6641, "y": 0.3750, "w": 0.3213, "h": 0.3218},
        ],
    },
    {
        "name": "Newborn Feature Four",
        "photo_count": 4,
        "positions": [
            {"x": 0.0000, "y": 0.1196, "w": 0.6494, "h": 0.5049},
            {"x": 0.0000, "y": 0.6318, "w": 0.6494, "h": 0.2554},
            {"x": 0.6572, "y": 0.1196, "w": 0.3335, "h": 0.3779},
            {"x": 0.6572, "y": 0.5073, "w": 0.3335, "h": 0.3799},
        ],
    },
]
