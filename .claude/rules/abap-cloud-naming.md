# ABAP Cloud Naming Convention (IPS開発基準書 Ver4.0)

---

## Package

```
ZRAP                          Cloudアドオン開発クラス (root)
ZRAP_COM_00                   Cloud共通オブジェクト
ZRAP_COM_99                   CloudPJ固有オブジェクト (data element, etc.)
ZRAP_<TYPE>_<XXXXX>           機能別パッケージ
```

`<TYPE>` = TPL | REP | FUN | IF | BI  
`<XXXXX>` = `<ModuleID><PJCode>` (例: VR001, PF908)  
PJ固有 → 末尾連番 901〜 (例: ZRAP_REP_VR901)

調査用: `ZRAP_RESEARCH` 配下に `Z<社員ID>` または `Z<ユーザID>`

---

## Module ID

| ID | 対象 |
|----|------|
| T  | ZRAP_TPL |
| R  | ZRAP_REP (帳票) |
| F  | ZRAP_FUN (機能) |
| I  | ZRAP_IF (IF) |
| B  | ZRAP_BI (BI) |

---

## CDS / Data Definition

| 区分 | prefix | 例 |
|------|--------|----|
| Data Model (base/interface) | `ZI_` | `ZI_VR001_01` |
| Projection View | `ZC_` | `ZC_VR001_01` |
| Action parameter screen | `ZA_` | `ZA_VR001_01` |
| Table function | `ZF_` | `ZF_VR001_01` |

Description:
- Projection View: `Projection View for <DataModel>`
- Data Model: `Data Model：<説明>`

---

## Behavior Definition

Same ID as the Data Model it belongs to.  
例: Data Model `ZI_VR001_01` → Behavior Definition `ZI_VR001_01`

---

## Metadata Extension

Same ID as the Projection View.  
例: Projection View `ZC_VR001_01` → Metadata Extension `ZC_VR001_01`  
Description: `Metadata Extension for ZC_VR001_01`

---

## ABAP Class

| prefix | 用途 | Format | 例 |
|--------|------|--------|----|
| `ZBP_` | Behavior Implementation (auto-generated from BDEF) | `ZBP_` + (Data Model ID **bỏ chữ `Z` đầu**) | `ZI_VF901_01` → `ZBP_I_VF901_01`<br>`ZI_MI902_01_VN` → `ZBP_I_MI902_01_VN` |
| `ZCL_` | General class | — | `ZCL_VF901_01` |
| `ZCX_` | Exception class | — | `ZCX_VF901_01` |
| `ZCJ_` | Application Job class (= ZJC の下8桁) | — | `ZCJ_VF901_01` |

> **Quan trọng**: `ZBP_*` KHÔNG lồng `ZI_` (sai: ~~`ZBP_ZI_VF901_01`~~). ADT khi auto-generate Behavior Implementation từ BDEF `ZI_xxx` luôn sinh `ZBP_I_xxx` — chữ `Z` đầu của Data Model ID bị strip để tránh `ZZ` lặp.

---

## Service Definition

```
ZSD_<8chars>
```
参照元 `ZC_VR001_01` → `ZSD_VR001_01`  
Description: `Service Definition for ZSD_VR001_01`

---

## Service Binding

```
ZSB_<BindingType>_<8chars>
```

| BindingType | 種別 |
|-------------|------|
| `U2`  | OData V2 - UI |
| `U2W` | OData V2 - Web API |
| `U4`  | OData V4 - UI |
| `U4W` | OData V4 - Web API |
| `A4`  | OData V4 - Web API (A2X system-to-system, binding kind G4BA) |
| `AS`  | SQL - Web API |

> `A4` vs `U4W`: cùng OData V4 Web API. `A4` là biến thể A2X (kind `G4BA`) cho inbound system-to-system thuần API, sinh `SCO2 <SRVB>_0001_G4BA` + IAM. VD `ZSB_A4_PI901_01`.

例: Service Definition `ZSD_VR001_01` → `ZSB_U4_VR001_01`  
Description: `Service Binding for ZSD_VR001_01`

---

## Service Consumption Model

```
ZSC_<Mode>_<PJCode>_<NN>
```

| Mode | 種別 |
|------|------|
| `OD` | OData |
| `RF` | RFC |
| `WS` | Web Service |

例: パッケージ `ZRAP_FUN_PF908`、OData 1回目 → `ZSC_OD_PF908_01`

---

## IAM Apps

```
ZIAM_<BindingType>_<PJCode>_<NN>
```

参照元 `ZSB_U4_FT001_01` → `ZIAM_U4_FT001_01`  
App Type suffix: `_EXT` | `_MBC` | `_UI5A`

---

## IAM Business Catalog

```
ZBC_<...>
```

---

## Application Job

```
ZJC_<PJCode>_<NN>   (Catalog Entry)
ZJT_<PJCode>_<NN>   (Template — same PJCode/NN as Catalog Entry)
ZCJ_<PJCode>_<NN>   (ABAP Class for Job)
```

例: `ZJC_VR001_01` → Template `ZJT_VR001_01`, Class `ZCJ_VR001_01`

---

## Communication Scenario / Outbound Service

Same as the IF package name.  
例: パッケージ `ZRAP_IF_YI001` → Communication Scenario `ZRAP_IF_YI001`

---

## HTTP Service

```
ZHS_<PJCode>_<NN>
```
紐付くクラスは HTTP Service ID (Z除く) に準拠。  
例: パッケージ `ZRAP_IF_VI901` の場合、Name入力でHandler Classが自動生成される。

---

## Number Range Object

```
ZNR_<...>
```

---

## Scalar Function

```
ZSF_<...>_<NN>                    (Definition)
ZSF_<...>_<NN>_SQL                (SQL Engine Implementation)
ZCL_ZSF_<...>_<NN>_SQL            (ABAP Class for AMDP Reference)
```

---

## Data Element / Domain

| Object | prefix |
|--------|--------|
| Data Element | `ZZ` |
| Domain | `ZZ` |

---

## Database Table (アドオン)

Draft テーブル: 末尾に `_D` を付与。

---

## ABAP Variable Naming — BẮT BUỘC

KHÔNG dùng prefix kiểu SAP cũ (`lv_`, `ls_`, `lt_`, `gv_`, `gs_`, `gt_`). Dùng prefix IPS Ver4.0:

| Scope | Elementary (field) | Structure | Table (internal) | Object ref | Constant |
|-------|-------------------|-----------|-----------------|-----------|---------|
| Local | `ldf_` | `lds_` | `ldt_` | `ldo_` | `ldc_` |
| Global (attribute) | `gdf_` | `gds_` | `gdt_` | `gdo_` | `gdc_` |
| Parameter IMPORTING | `idf_` | `ids_` | `idt_` | `ido_` | — |
| Parameter EXPORTING | `edf_` | `eds_` | `edt_` | `edo_` | — |
| Parameter CHANGING | `cdf_` | `cds_` | `cdt_` | `cdo_` | — |
| Parameter RETURNING | `rdf_` | `rds_` | `rdt_` | `rdo_` | — |

Ví dụ:
```abap
DATA: ldf_status   TYPE c LENGTH 1,
      lds_header   TYPE ztable,
      ldt_items    TYPE TABLE OF ztable,
      ldo_helper   TYPE REF TO zcl_mi902_01.

METHODS process
  IMPORTING ids_request  TYPE za_mi902_01
  EXPORTING edf_status   TYPE c
            edf_message  TYPE string.
```

### Áp cả cho inline declaration & RAP/EML handler — BẮT BUỘC

Rule này áp cho **MỌI** biến, gồm inline `DATA(...)`, `FINAL(...)`, biến vòng lặp `FOR`/`LOOP`, và target của EML (`RESULT DATA(...)`, `REPORTED DATA(...)`, `MAPPED/FAILED DATA(...)`). KHÔNG được để `lt_`/`ls_`/`lv_` lọt vào behavior pool (`ZBP_*`), handler, job class.

```abap
" ĐÚNG (RAP behavior pool)
READ ENTITIES OF zi_vi901_01_vn IN LOCAL MODE
  ENTITY header ALL FIELDS WITH CORRESPONDING #( keys )
  RESULT DATA(ldt_headers).
LOOP AT ldt_headers INTO DATA(lds_header).
  DATA(ldf_total) = lines( ldt_items ).
  ... FOR lds_old IN ldt_old_items ( %tky = lds_old-%tky ) ...
ENDLOOP.

" SAI: RESULT DATA(lt_headers) / INTO DATA(ls_header) / DATA(lv_total)
```

- `%cid`/`%tky`/`%param`… là RAP component name (không đổi).
- EML entity/field alias (CamelCase) là name của model — giữ nguyên, không áp prefix.

---

## Version History Header (変更履歴) — BẮT BUỘC

MỌI object có source ABAP/CDS/BDEF phải mở đầu bằng block 変更履歴 — **TRỪ `TABL` (DDIC table): KHÔNG chèn header 変更履歴**. Dòng V1.00 = 新規作成 (fill thật: version/ngày tạo/社員ID người tạo/移送番号 transport); dòng V9.99 giữ nguyên làm template cho lần sửa sau.

```
************************************************************************
*  [変更履歴]                                                          *
*   バージョン情報 ：V1.00  YYYY/MM/DD  IPS.<Author>       <移送番号>  *
*   変更内容       ：新規作成                                          *
*----------------------------------------------------------------------*
*   バージョン情報 ：V9.99  YYYY/MM/DD  変更者             移送番号    *
*   変更内容       ：修正内容                                          *
************************************************************************
```

### Vị trí theo loại object — QUAN TRỌNG

- **CLAS (`ZBP_*`/`ZCL_*`/`ZCJ_*`/`ZCL_HS_*`)**: header đặt ở **GLOBAL class** (include `main`, trên dòng `CLASS ... DEFINITION`), **KHÔNG** ở `implementations`/`definitions` (local class). MCP: `update_source(system, "CLAS", ...)` (global) hoặc `update_class_include(..., "main", ...)`.
- **DDLS / BDEF / DDLX / SRVD**: header ở đầu source (trước `@…`/`define …`), dạng comment CDS `//` (DDL và BDEF đều dùng `//`).
- **TABL (DDIC table)**: **KHÔNG** chèn block 変更履歴 — source TABL bắt đầu thẳng bằng `@EndUserText.label`/`define table`. Lịch sử thay đổi table theo dõi qua transport, không qua comment header.
- Mỗi lần sửa object đã có header → thêm 1 dòng V-mới phía trên dòng V9.99 template (không xóa lịch sử cũ).

> `/rap-gen` khi tạo mới object phải chèn block này; thiếu Author/移送番号 → dùng placeholder `<Author>`/`<移送番号>` và note cho user điền.

---

## 共通ルール

- Add-On識別: 先頭 `Z` 固定
- PJCode: モジュールID(1〜2文字) + プロジェクト番号(3桁)、PJ固有は 901〜
- 連番 `NN`: `01` 始まり、2桁ゼロパディング
- Description 記載パターンは各オブジェクト欄の通りに統一すること
- ADTのフォント設定: MS ゴシックに変更（デフォルトは固定幅でないため）

---

## Country/Local Variant Suffix — BẮT BUỘC

Khi design doc khai báo `variant: Local VN` (hoặc local variant khác), suffix `_VN` (`_JP`, `_TH`, …) **bắt buộc** áp cho **MỌI** object trong case.

### Quy tắc đặt suffix

- **Vị trí**: ngay sau `NN` (số thứ tự), **trước** mọi hậu tố kỹ thuật khác (`_D`, `_EXT`, `_MBC`, `_UI5A`, `_SQL`).
- **Phạm vi**: package, CDS (`ZI_*`, `ZC_*`, `ZA_*`, `ZF_*`), BDEF, ZBP_I_*, ZCL_*, ZCJ_*, table, draft table, SRVD, SRVB, IAM App, BC, ZAL_*, ZHS_*, ZSC_*, ZNR_*, ZSF_*.
- **Không mix**: 1 case = 1 variant. Không được có object thiếu suffix lẫn với object có suffix trong cùng Object Impact List.

### Ví dụ Local VN (`_VN`)

| Object | Local VN | Global |
|--------|----------|--------|
| Package | `ZRAP_IF_MI902_VN` | `ZRAP_IF_MI902` |
| Data Model | `ZI_MI902_01_VN` | `ZI_MI902_01` |
| Behavior Impl | `ZBP_I_MI902_01_VN` | `ZBP_I_MI902_01` |
| Table | `ZM902T_VN` | `ZM902T` |
| Draft table | `ZM902T_VN_D` ← `_VN` trước `_D` | `ZM902T_D` |
| Service Binding | `ZSB_U4_MI902_01_VN` | `ZSB_U4_MI902_01` |
| IAM App | `ZIAM_U4_MI902_01_VN_EXT` ← `_VN` trước `_EXT` | `ZIAM_U4_MI902_01_EXT` |
| Scalar Function SQL | `ZSF_VF901_01_VN_SQL` ← `_VN` trước `_SQL` | `ZSF_VF901_01_SQL` |

### Validation by `/rap-gen`

`/rap-gen` đọc `variant` từ frontmatter design doc + scan Object Impact List. Phát hiện mismatch (Local VN mà object thiếu suffix, hoặc Global mà có object `_VN`) → **STOP**, không deploy.
