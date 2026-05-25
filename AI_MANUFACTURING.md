# KiCad Compatibility & Manufacturing Pipeline Specification

This document defines the S-Expression grammar compiler, KiCad schematic/layout parsing logic, Gerber output layers, Excellon drill charts exporter, and industrial-grade IPC manufacturing metadata profiles for our browser-native EDA platform.

---

## 1. S-Expression Parsing & Tokenizer Engine

KiCad schemas leverage a parenthetical recursive layout format. The compiler tokenizes and constructs lexical nodes using a token state scanner:

```text
       Raw KiCad Data Stream: `(kicad_sch (symbol (lib_id "ESP32")))`
                                  │
                                  ▼  Tokenized list of entities
                                  │  ['(', 'kicad_sch', '(', 'symbol', '(', 'lib_id', '"ESP32"', ')', ')', ')']
                                  ▼
       Symbol Node:
       {
         name: "symbol",
         args: [
           { name: "lib_id", args: ["ESP32"] }
         ]
       }
```

This SExpr format is recursively scanned and translated into deterministic `AIAction` blocks, generating exact transactions that update the project layout state.

---

## 2. Integrated Manufacturing Exporter Modules

To convert our `ProjectGraph` into industrial assembly-ready artifacts, the platform generates consolidated files:

1.  **Bill of Materials (BOM):** Pools duplicate active devices by footprint packages and value properties, generating component quantities and supplier part numbers for easy reference.
2.  **Pick-and-Place Coordinate Positional Spreadsheet (CPL):** Extracts global board centroids ($X$, $Y$) in physical millimeters, rotation offsets, and package mounting layers (top vs. bottom).
3.  **IPC-D-356 Stackup Headers:** Generates full manufacturing parameters detailing target layer stack thickness, material cores, surface finishes, and resist colors.
