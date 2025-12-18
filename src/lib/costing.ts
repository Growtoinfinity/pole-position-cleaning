const costing = {
  "PropertyTypes": {
    "Terraced": {
      "1 Bedroom": { "6_weekly": 22, "8_weekly": 24, "12_weekly": 28, "One_off": 42, "Conservatory": 4, "Extension": 4, "Gutter_clearance": 80, "Fascia_soffit_gutter_clean": 80 },
      "2 Bedroom": { "6_weekly": 22, "8_weekly": 24, "12_weekly": 28, "One_off": 42, "Conservatory": 4, "Extension": 4, "Gutter_clearance": 80, "Fascia_soffit_gutter_clean": 80 },
      "3 Bedroom": { "6_weekly": 22, "8_weekly": 24, "12_weekly": 28, "One_off": 42, "Conservatory": 4, "Extension": 4, "Gutter_clearance": 90, "Fascia_soffit_gutter_clean": 90 },
      "4 Bedroom": { "6_weekly": 24, "8_weekly": 26, "12_weekly": 30, "One_off": 46, "Conservatory": 4, "Extension": 4, "Gutter_clearance": 100, "Fascia_soffit_gutter_clean": 100 },
      "5 Bedroom": { "6_weekly": 26, "8_weekly": 28, "12_weekly": 32, "One_off": 50, "Conservatory": 4, "Extension": 4, "Gutter_clearance": 100, "Fascia_soffit_gutter_clean": 100 },
    },
    "SemiDetached": {
      "1 Bedroom": { "6_weekly": 20, "8_weekly": 22, "12_weekly": 28, "One_off": 44, "Conservatory": 4, "Extension": 4, "Gutter_clearance": 100, "Fascia_soffit_gutter_clean": 100 },
      "2 Bedroom": { "6_weekly": 20, "8_weekly": 22, "12_weekly": 28, "One_off": 44, "Conservatory": 4, "Extension": 4, "Gutter_clearance": 100, "Fascia_soffit_gutter_clean": 100 },
      "3 Bedroom": { "6_weekly": 22, "8_weekly": 24, "12_weekly": 30, "One_off": 48, "Conservatory": 4, "Extension": 4, "Gutter_clearance": 120, "Fascia_soffit_gutter_clean": 120 },
      "4 Bedroom": { "6_weekly": 24, "8_weekly": 26, "12_weekly": 30, "One_off": 52, "Conservatory": 6, "Extension": 6, "Gutter_clearance": 140, "Fascia_soffit_gutter_clean": 140 },
      "5 Bedroom": { "6_weekly": 26, "8_weekly": 28, "12_weekly": 32, "One_off": 60, "Conservatory": 6, "Extension": 6, "Gutter_clearance": 160, "Fascia_soffit_gutter_clean": 160 }
    },
    "Detached": {
      "1 Bedroom": { "6_weekly": 20, "8_weekly": 22, "12_weekly": 28, "One_off": 44, "Conservatory": 4, "Extension": 4, "Gutter_clearance": 100, "Fascia_soffit_gutter_clean": 100 },
      "2 Bedroom": { "6_weekly": 24, "8_weekly": 26, "12_weekly": 30, "One_off": 44, "Conservatory": 4, "Extension": 4, "Gutter_clearance": 120, "Fascia_soffit_gutter_clean": 120 },
      "3 Bedroom": { "6_weekly": 26, "8_weekly": 28, "12_weekly": 32, "One_off": 48, "Conservatory": 6, "Extension": 6, "Gutter_clearance": 140, "Fascia_soffit_gutter_clean": 140 },
      "4 Bedroom": { "6_weekly": 28, "8_weekly": 30, "12_weekly": 34, "One_off": 60, "Conservatory": 6, "Extension": 6, "Gutter_clearance": 160, "Fascia_soffit_gutter_clean": 160 },
      "5 Bedroom": { "6_weekly": 30, "8_weekly": 32, "12_weekly": 36, "One_off": 64, "Conservatory": 6, "Extension": 6, "Gutter_clearance": 180, "Fascia_soffit_gutter_clean": 180 }
    },
    "TownHouse": {
      "1 Bedroom": { "6_weekly": 20, "8_weekly": 22, "12_weekly": 28, "One_off": 44, "Conservatory": 4, "Extension": 4, "Gutter_clearance": 100, "Fascia_soffit_gutter_clean": 100 },
      "2 Bedroom": { "6_weekly": 24, "8_weekly": 26, "12_weekly": 30, "One_off": 46, "Conservatory": 4, "Extension": 4, "Gutter_clearance": 120, "Fascia_soffit_gutter_clean": 120 },
      "3 Bedroom": { "6_weekly": 26, "8_weekly": 28, "12_weekly": 32, "One_off": 48, "Conservatory": 4, "Extension": 4, "Gutter_clearance": 140, "Fascia_soffit_gutter_clean": 140 },
      "4 Bedroom": { "6_weekly": 28, "8_weekly": 30, "12_weekly": 34, "One_off": 60, "Conservatory": 5, "Extension": 5, "Gutter_clearance": 160, "Fascia_soffit_gutter_clean": 160 },
      "5 Bedroom": { "6_weekly": 30, "8_weekly": 32, "12_weekly": 34, "One_off": 64, "Conservatory": 5, "Extension": 5, "Gutter_clearance": 180, "Fascia_soffit_gutter_clean": 180 }
    }
  },
  "ConservatoryRoofCleaning": {
    "External": {
      "Terraced": {
        "1": 120,
        "2": 120,
        "3": 120,
        "4": 120,
        "5": 120
      },
      "SemiDetached": {
        "1": 140,
        "2": 140,
        "3": 140,
        "4": 160,
        "5": 160
      },
      "Detached": {
        "1": 160,
        "2": 160,
        "3": 160,
        "4": 180,
        "5": 180
      },
      "TownHouse": {
        "1": 140,
        "2": 140,
        "3": 140,
        "4": 160,
        "5": 160
      }
    },
    "Internal": {
      "Terraced": {
        "1": 120,
        "2": 120,
        "3": 120,
        "4": 120,
        "5": 120
      },
      "SemiDetached": {
        "1": 140,
        "2": 140,
        "3": 140,
        "4": 160,
        "5": 160
      },
      "Detached": {
        "1": 160,
        "2": 160,
        "3": 160,
        "4": 180,
        "5": 180
      },
      "TownHouse": {
        "1": 140,
        "2": 140,
        "3": 140,
        "4": 160,
        "5": 160
      }
    }
  }
}

export default costing