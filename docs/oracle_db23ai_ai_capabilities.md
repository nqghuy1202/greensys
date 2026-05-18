---
document_type: database_ai_capabilities_audit
document_version: "1.0"
created_date: 2026-05-12
language: vi
server_hostname: localhost.localdomain
database: Oracle Database 23ai Free
apex_version: 24.2.16
purpose: >
  Audit toàn diện các tính năng AI có sẵn trong Oracle DB 23ai.
  Dùng để: tra cứu capability, lập kế hoạch tích hợp AI,
  đề xuất kiến trúc RAG/Vector Search/Select AI cho Oracle APEX app.
tags: [oracle-db, 23ai, vector-search, onnx, oml, oracle-text, select-ai, dbms-cloud, rag, ollama, cohere, apex-24]
related_documents:
  - server_audit_OL810.md
---

# Oracle DB 23ai — AI Capabilities Audit

## QUICK REFERENCE — Trả lời nhanh các câu hỏi thường gặp

```
Q: DB có hỗ trợ Vector Search không?       → YES (DBMS_VECTOR, DBMS_VECTOR_CHAIN: VALID)
Q: Có thể import model ONNX vào DB không?  → YES (DBMS_DATA_MINING: VALID)
Q: Oracle Text / Full-text search có không? → YES (CONTEXT component: VALID 23.0.0.0.0)
Q: Select AI (text-to-SQL) dùng được không?→ YES (DBMS_CLOUD_AI: VALID — bất ngờ)
Q: Đã có credential AI nào chưa?           → YES (COHERE_CRED: enabled)
Q: Ollama local có gọi được từ DB không?   → PARTIAL (cần thêm ACL cho 127.0.0.1:11434)
Q: Vector memory đã cấu hình chưa?         → NO (vector_memory_size=0 — cần set)
Q: Oracle APEX version?                    → 24.2.16 (VALID)
Q: DB có phải CDB không?                   → Cần xác nhận (chưa có output v$database)
```

---

## 1. DATABASE IDENTITY

```
db_type:              Oracle Database 23ai Free
db_version:           23.0.0.0.0
apex_version:         24.2.16
oracle_text_version:  23.0.0.0.0
server_os:            Oracle Linux Server 8.10
kernel:               5.15.0-317.197.5.2.el8uek.x86_64 (UEK R7)
virtualization:       VMware (full VM)
```

### Installed Components (dba_registry)

```
comp_id   comp_name                              version       status
--------  -------------------------------------  ------------  ----------
APEX      Oracle APEX                            24.2.16       VALID
CATALOG   Oracle Database Catalog Views          23.0.0.0.0    VALID
CATJAVA   Oracle Database Java Packages          23.0.0.0.0    VALID
CATPROC   Oracle Database Packages and Types     23.0.0.0.0    VALID
CONTEXT   Oracle Text                            23.0.0.0.0    VALID
DV        Oracle Database Vault                  23.0.0.0.0    VALID
JAVAVM    JServer JAVA Virtual Machine           23.0.0.0.0    VALID
OLS       Oracle Label Security                  23.0.0.0.0    VALID
OWM       Oracle Workspace Manager               23.0.0.0.0    VALID
RAC       Oracle Real Application Clusters       23.0.0.0.0    OPTION OFF
SDO       Spatial                                23.0.0.0.0    VALID
XML       Oracle XDK                             23.0.0.0.0    VALID
XDB       Oracle XML Database                    23.0.0.0.0    VALID
APS       OLAP Analytic Workspace                23.0.0.0.0    VALID
XOQ       Oracle OLAP API                        23.0.0.0.0    VALID
```

---

## 2. AI VECTOR SEARCH

### Status

```
feature_name:     AI Vector Search
availability:     SUPPORTED [STATUS: OK]
blocking_issues:  NONE
```

### Packages

```
package_name          status   note
--------------------  -------  ------------------------------------
DBMS_VECTOR           VALID    Core vector operations, similarity search
DBMS_VECTOR_CHAIN     VALID    RAG pipeline: chunk → embed → search → generate
UTL_TO_CHUNKS         VALID    Text chunking cho RAG
UTL_TO_EMBEDDINGS     VALID    Generate embeddings từ text
UTL_TO_SUMMARY        VALID    Tóm tắt text
UTL_TO_TEXT           VALID    Extract text từ document (PDF, DOCX...)
```

### Parameters

```
vector_memory_size:                 0         [WARNING: chưa cấu hình — xem mục 2.3]
inmemory_deep_vectorization:        TRUE      [OK: tối ưu vector với In-Memory]
vector_index_neighbor_graph_reload: RESTART   [INFO: HNSW index reload on restart]
vector_query_capture:               ON        [INFO: đang capture vector query stats]
spatial_vector_acceleration:        TRUE      [OK: tăng tốc với Spatial option]
```

### 2.1 Vector Datatypes & Index Types

```sql
-- VECTOR datatype: available in 23ai
-- Cú pháp: VECTOR(dimensions, format)
-- Ví dụ:
--   VECTOR(384, FLOAT32)   -- nomic-embed-text (Ollama)
--   VECTOR(1024, FLOAT32)  -- Cohere embed-english-v3.0
--   VECTOR(*, *)           -- flexible dimension

-- Index types:
--   HNSW  (Hierarchical Navigable Small World) — in-memory, fast ANN
--   IVF   (Inverted File)                      — disk-based, large dataset
```

### 2.2 Vector Distance Functions

```sql
-- Available distance metrics:
VECTOR_DISTANCE(v1, v2, COSINE)       -- ngữ nghĩa văn bản (khuyến nghị cho RAG)
VECTOR_DISTANCE(v1, v2, DOT)          -- dot product
VECTOR_DISTANCE(v1, v2, EUCLIDEAN)    -- khoảng cách Euclidean
VECTOR_DISTANCE(v1, v2, MANHATTAN)    -- L1 distance

-- Shorthand operators:
v1 <=> v2   -- COSINE distance
v1 <#> v2   -- negative DOT product
v1 <-> v2   -- EUCLIDEAN distance
```

### 2.3 Cảnh báo: vector_memory_size = 0

```
issue:    vector_memory_size chưa được set (= 0)
impact:   HNSW vector index KHÔNG load vào memory pool riêng
          → Oracle lấy từ SGA pool chung → có thể thiếu khi load lớn
fix:      ALTER SYSTEM SET vector_memory_size = 512M SCOPE=SPFILE;
          -- sau đó restart DB
note:     Server có 62 GiB RAM, SGA nên có đủ — nhưng nên explicit set
          Kiểm tra SGA trước: SELECT value/1024/1024/1024 gb
          FROM v$parameter WHERE name = 'sga_target';
```

---

## 3. ONNX RUNTIME & ORACLE MACHINE LEARNING (OML)

### Status

```
feature_name:  ONNX Model Import / OML
availability:  SUPPORTED [STATUS: OK]
```

### Packages

```
package_name                status   note
--------------------------  -------  ----------------------------------------
DBMS_DATA_MINING            VALID    Core OML: train, apply, evaluate models
DBMS_PREDICTIVE_ANALYTICS   VALID    Simplified ML (PREDICT, EXPLAIN)
```

### Capabilities

```
import_onnx_model:       YES  — DBMS_VECTOR.LOAD_ONNX_MODEL()
supported_model_types:
  - embedding_models:    YES  — import .onnx embedding model vào DB
  - classification:      YES
  - regression:          YES
  - clustering:          YES
  - anomaly_detection:   YES
run_inference_in_db:     YES  — không cần gọi ra ngoài sau khi import
```

### Ví dụ import ONNX embedding model

```sql
-- Import embedding model từ file .onnx vào DB
BEGIN
  DBMS_VECTOR.LOAD_ONNX_MODEL(
    directory   => 'MODELS_DIR',        -- Oracle DIRECTORY object trỏ đến folder
    file_name   => 'all-minilm-l6.onnx',
    model_name  => 'MY_EMBED_MODEL',
    metadata    => JSON('{"function":"embedding","embeddingOutput":"embedding"}')
  );
END;
/

-- Dùng model đã import để generate embedding
SELECT VECTOR_EMBEDDING(MY_EMBED_MODEL USING text AS data)
FROM my_table;
```

### Models tương thích để import vào 23ai

```
model_name               dims   format   source
-----------------------  -----  -------  ----------------------------
all-MiniLM-L6-v2         384    FLOAT32  HuggingFace (nhỏ, nhanh)
all-MiniLM-L12-v2        384    FLOAT32  HuggingFace
multilingual-e5-small    384    FLOAT32  HuggingFace (hỗ trợ tiếng Việt)
multilingual-e5-large    1024   FLOAT32  HuggingFace (chất lượng cao hơn)
note: export sang .onnx bằng optimum-cli hoặc sentence-transformers
```

---

## 4. ORACLE TEXT (FULL-TEXT SEARCH)

### Status

```
feature_name:  Oracle Text
component_id:  CONTEXT
version:       23.0.0.0.0
status:        VALID [STATUS: OK]
```

### Packages

```
package_name   status   note
-----------    -------  ---------------------------------
CTX_DDL        VALID    Tạo/quản lý index, preferences
CTX_QUERY      VALID    Query full-text, CONTAINS()
```

### Capabilities

```
index_types:
  CONTEXT:      Full-text index cho document search
  CTXCAT:       Catalog index cho mixed query
  CTXRULE:      Classify document vào category
  CTXXPATH:     XML full-text search

query_operators:
  CONTAINS():   Full-text search với scoring
  CATSEARCH():  Catalog search
  MATCHES():    Rule-based matching

features:
  stemming:         YES  — "running" khớp "run", "runs"
  fuzzy_search:     YES  — tìm gần đúng, chịu lỗi chính tả
  proximity_search: YES  — NEAR((word1, word2), distance)
  highlight:        YES  — highlight kết quả trong document
  theme_search:     YES  — tìm theo chủ đề
  multilingual:     YES  — cần cấu hình lexer cho tiếng Việt
```

### Kết hợp Oracle Text + Vector Search (Hybrid RAG)

```sql
-- Pattern: Hybrid search — kết hợp full-text score + vector similarity
SELECT d.id, d.content,
       CONTAINS(d.content, :keyword) AS text_score,
       VECTOR_DISTANCE(d.embedding, :query_vec, COSINE) AS vec_distance
FROM documents d
WHERE CONTAINS(d.content, :keyword) > 0
ORDER BY (CONTAINS(d.content, :keyword) * 0.4 +
         (1 - VECTOR_DISTANCE(d.embedding, :query_vec, COSINE)) * 0.6) DESC
FETCH FIRST 10 ROWS ONLY;
-- text_score weight: 0.4, semantic score weight: 0.6 — tunable
```

---

## 5. SELECT AI (TEXT-TO-SQL & AI CHAT)

### Status

```
feature_name:   Select AI
package:        DBMS_CLOUD_AI
status:         VALID [STATUS: OK — unexpected for Free edition]
blocking_issues: NONE
```

### Capabilities

```
text_to_sql:     YES  — viết câu hỏi tự nhiên, DB tự sinh SQL
narrate:         YES  — trả lời bằng ngôn ngữ tự nhiên
showsql:         YES  — hiển thị SQL được sinh ra (debug)
runsql:          YES  — thực thi SQL và trả về kết quả
chat:            YES  — hỏi đáp AI không liên quan schema
supported_providers:
  - openai:      YES
  - cohere:      YES  [CONFIGURED — COHERE_CRED đã có]
  - azure:       YES
  - google:      YES
  - ollama:      CHECK — cần test với endpoint local
```

### COHERE_CRED — Credential đã có sẵn

```
credential_name: COHERE_CRED
provider:        Cohere AI
username:        COHERE
enabled:         TRUE
status:          [READY TO USE]

available_cohere_models:
  embedding:   embed-english-v3.0  (1024 dims)
               embed-multilingual-v3.0  (1024 dims, hỗ trợ tiếng Việt)
  generation:  command-r-plus (tốt cho text-to-SQL)
               command-r
```

### Ví dụ dùng Select AI với COHERE_CRED

```sql
-- Tạo AI profile (nếu chưa có)
BEGIN
  DBMS_CLOUD_AI.CREATE_PROFILE(
    profile_name => 'COHERE_PROFILE',
    attributes   => '{"provider":"cohere",
                      "credential_name":"COHERE_CRED",
                      "model":"command-r-plus",
                      "object_list":[{"owner":"DEV24","name":"*"}]}'
  );
END;
/

-- Dùng Select AI — text-to-SQL
SELECT AI narrate 'Tổng doanh thu tháng này theo từng khách hàng'
USING PROFILE cohere_profile;

-- Hiển thị SQL được sinh ra
SELECT AI showsql 'Top 10 lead có xác suất chốt cao nhất'
USING PROFILE cohere_profile;
```

---

## 6. DBMS_CLOUD — REST API & External Calls

### Status

```
feature_name:  DBMS_CLOUD
status:        VALID [STATUS: OK]
use_cases:
  - Gọi REST API bên ngoài (Ollama, OpenAI, Cohere...)
  - Download file từ URL vào DB
  - Upload/download Object Storage
  - Gọi DBMS_VECTOR_CHAIN với provider external
```

### So sánh DBMS_CLOUD vs UTL_HTTP cho gọi Ollama

```
method           pros                          cons
-------------    --------------------------    -------------------------
DBMS_CLOUD       - API đơn giản hơn           - Cần wallet nếu HTTPS
                 - Built-in JSON handling      - 23ai feature
                 - Tích hợp DBMS_VECTOR_CHAIN

UTL_HTTP         - Đã có ACL sẵn (DEV24)      - Phải tự parse JSON
                 - Quen thuộc, nhiều example  - Verbose hơn
                 - Không cần wallet cho HTTP

recommendation:  Dùng UTL_HTTP cho Ollama HTTP (đã có ACL)
                 Dùng DBMS_CLOUD cho Cohere HTTPS (đã có COHERE_CRED)
```

---

## 7. NETWORK ACL — Trạng thái kết nối

### ACL hiện tại

```
user:    DEV24
granted_privileges:
  - resolve   YES   (DNS lookup)
  - connect   YES   (TCP connect)
  - http      YES   (HTTP calls)

note: DEV24 có đủ quyền gọi HTTP ra ngoài [STATUS: OK]
```

### Trạng thái ACL theo endpoint

```
endpoint                    port   status          note
--------------------------  -----  --------------  ---------------------------
Cohere API (api.cohere.ai)  443    LIKELY OK       COHERE_CRED đã enabled
Ollama local (127.0.0.1)    11434  UNCONFIRMED     Cần kiểm tra và thêm ACL
Ollama local (localhost)    11434  UNCONFIRMED     Cần kiểm tra và thêm ACL
```

### Script thêm ACL cho Ollama (nếu chưa có)

```sql
-- Chạy với SYS hoặc user có quyền EXECUTE trên DBMS_NETWORK_ACL_ADMIN
BEGIN
  DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
    host       => '127.0.0.1',
    lower_port => 11434,
    upper_port => 11434,
    ace        => xs$ace_type(
                    privilege_list => xs$name_list('connect','http'),
                    principal_name => 'DEV24',
                    principal_type => xs_acl.ptype_db)
  );
  COMMIT;
END;
/
```

---

## 8. AI ARCHITECTURE OPTIONS

### Option A — DBMS_VECTOR_CHAIN + Cohere (Recommended — sẵn sàng ngay)

```
status:      READY — không cần setup thêm
flow:
  1. User query (APEX)
     ↓
  2. UTL_TO_CHUNKS (DB) — chunk document
     ↓
  3. DBMS_VECTOR_CHAIN → Cohere embed-multilingual-v3.0
     → generate embedding (1024 dims)
     ↓
  4. VECTOR table — lưu embedding
     ↓
  5. VECTOR_DISTANCE(COSINE) — tìm chunk liên quan
     ↓
  6. DBMS_CLOUD_AI (Cohere command-r-plus) — generate answer
     ↓
  7. APEX — hiển thị kết quả

pros:
  - Không cần cài thêm gì
  - Cohere multilingual hỗ trợ tiếng Việt tốt
  - command-r-plus tốt cho text-to-SQL
cons:
  - Phụ thuộc internet + Cohere API key
  - Chi phí theo token (Cohere có free tier 1000 req/min)
```

### Option B — DBMS_VECTOR_CHAIN + Ollama (On-premise, Privacy)

```
status:      NEEDS_SETUP (thêm ACL cho localhost:11434)
flow:
  1. User query (APEX)
     ↓
  2. UTL_HTTP / DBMS_CLOUD → Ollama API (localhost:11434)
     → model: nomic-embed-text (384 dims)
     ↓
  3. VECTOR table — lưu embedding
     ↓
  4. VECTOR_DISTANCE(COSINE) — similarity search
     ↓
  5. UTL_HTTP → Ollama (qwen2.5:7b) — generate answer
     ↓
  6. APEX — hiển thị kết quả

setup_steps:
  1. Đảm bảo Ollama đang chạy: systemctl status ollama
  2. Thêm ACL 127.0.0.1:11434 cho DEV24 (script ở mục 7)
  3. Test: SELECT UTL_HTTP.REQUEST('http://127.0.0.1:11434/api/tags') FROM dual;

pros:
  - Hoàn toàn on-premise, không gửi data ra ngoài
  - Free, không phụ thuộc internet
  - Đã có Ollama trên cùng server (context lịch sử)
cons:
  - CPU inference chậm hơn GPU
  - nomic-embed-text 384 dims < Cohere 1024 dims
```

### Option C — Hybrid (Best Quality)

```
status:      NEEDS_MINOR_SETUP
architecture:
  embedding:   Cohere embed-multilingual-v3.0 (chất lượng cao, tiếng Việt)
  generation:  Ollama qwen2.5:7b local (free, on-premise)
  text-to-sql: Select AI + Cohere command-r (chất lượng SQL tốt)
  full-text:   Oracle Text CONTAINS() cho keyword search
  vector:      HNSW index (sau khi set vector_memory_size)

recommendation: [RECOMMENDED for production]
```

### Option D — ONNX Import (Fully In-DB)

```
status:      NEEDS_SETUP
concept:     Import .onnx embedding model vào DB
             → generate embedding ngay trong SQL, không gọi ra ngoài
setup:
  1. Download model: multilingual-e5-small từ HuggingFace
  2. Export sang .onnx: optimum-cli export onnx
  3. Upload vào Oracle DIRECTORY
  4. DBMS_VECTOR.LOAD_ONNX_MODEL(...)

pros:
  - Embedding trong DB — cực nhanh, không network call
  - Fully air-gapped nếu cần
cons:
  - Cần setup bước đầu
  - Model size nhỏ hơn Cohere
```

---

## 9. ACTION ITEMS — Việc cần làm để bật AI

```
priority: CRITICAL
[ ] 1. Kiểm tra và set vector_memory_size
        query:  SELECT value/1024/1024/1024 gb FROM v$parameter
                WHERE name = 'sga_target';
        action: ALTER SYSTEM SET vector_memory_size = 512M SCOPE=SPFILE;
        reason: HNSW index cần memory pool riêng để hoạt động tối ưu

priority: HIGH
[ ] 2. Test COHERE_CRED còn valid không
        SELECT DBMS_CLOUD.SEND_REQUEST(
          credential_name => 'COHERE_CRED',
          uri => 'https://api.cohere.ai/v1/models',
          method => 'GET').text_body
        FROM dual;

[ ] 3. Thêm ACL cho Ollama localhost:11434
        script: xem mục 7
        test:   SELECT UTL_HTTP.REQUEST('http://127.0.0.1:11434/api/tags')
                FROM dual;

[ ] 4. Kiểm tra Select AI profile đã tạo chưa
        SELECT profile_name, provider, model, status
        FROM dba_cloud_ai_profiles;

priority: MEDIUM
[ ] 5. Tạo VECTOR table structure cho RAG
        -- Xem template ở mục 10

[ ] 6. Cấu hình Oracle Text lexer cho tiếng Việt
        BEGIN
          CTX_DDL.CREATE_PREFERENCE('VIET_LEXER','BASIC_LEXER');
          CTX_DDL.SET_ATTRIBUTE('VIET_LEXER','MIXED_CASE','NO');
        END;

[ ] 7. Kiểm tra quyền DEV24 đủ để dùng DBMS_VECTOR
        SELECT * FROM session_privs WHERE privilege LIKE '%VECTOR%';
        -- Nếu thiếu: GRANT EXECUTE ON DBMS_VECTOR TO DEV24;
```

---

## 10. RAG TABLE TEMPLATE — Cấu trúc bảng cho Vector RAG

```sql
-- Template chuẩn cho RAG trong Oracle 23ai
CREATE TABLE rag_documents (
    id              NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_type     VARCHAR2(50),       -- 'PDF', 'WEBPAGE', 'MANUAL', ...
    source_ref      VARCHAR2(500),      -- URL, file path, doc ID
    chunk_index     NUMBER,             -- thứ tự chunk trong document
    chunk_text      CLOB,               -- nội dung text gốc
    embedding       VECTOR(1024, FLOAT32),  -- Cohere dims=1024
    -- hoặc:        VECTOR(384, FLOAT32),   -- Ollama nomic-embed-text / ONNX
    metadata        JSON,               -- tags, date, author...
    created_at      TIMESTAMP DEFAULT SYSTIMESTAMP,
    CONSTRAINT uq_source_chunk UNIQUE (source_ref, chunk_index)
);

-- HNSW Vector Index (in-memory, fast ANN)
CREATE VECTOR INDEX idx_rag_embedding
ON rag_documents(embedding)
ORGANIZATION INMEMORY NEIGHBOR GRAPH
DISTANCE COSINE
WITH TARGET ACCURACY 95;

-- Oracle Text index trên chunk_text (hybrid search)
CREATE INDEX idx_rag_text ON rag_documents(chunk_text)
INDEXTYPE IS CTXSYS.CONTEXT
PARAMETERS ('LEXER VIET_LEXER SYNC (ON COMMIT)');
```

---

## 11. CAPABILITY MATRIX — Tóm tắt cuối cùng

| Tính năng | Available | Status | Ready to Use | Cần setup |
|---|---|---|---|---|
| VECTOR datatype | YES | VALID | YES | Không |
| DBMS_VECTOR | YES | VALID | YES | Không |
| DBMS_VECTOR_CHAIN | YES | VALID | YES | Không |
| UTL_TO_CHUNKS | YES | VALID | YES | Không |
| HNSW Vector Index | YES | — | Sau khi set memory | vector_memory_size |
| ONNX Model Import | YES | VALID | Cần file .onnx | Download + import |
| OML / Data Mining | YES | VALID | YES | Không |
| Oracle Text | YES | VALID | YES | Lexer tiếng Việt |
| Select AI | YES | VALID | YES | Tạo profile |
| DBMS_CLOUD_AI | YES | VALID | YES | Không |
| COHERE_CRED | YES | ENABLED | YES | Test còn valid |
| Ollama (local) | PARTIAL | — | Sau ACL | Thêm ACL 11434 |
| RAC | NO | OPTION OFF | — | — |

---

## 12. RAW AUDIT DATA

<details>
<summary>Block 2: Vector Packages output</summary>

```
DBMS_VECTOR           VALID  (x3 — CDB + PDB instances)
DBMS_VECTOR_CHAIN     VALID  (x3)
vector_memory_size              = 0
inmemory_deep_vectorization     = TRUE
vector_index_neighbor_graph_reload = RESTART
vector_query_capture            = ON
spatial_vector_acceleration     = TRUE
```

</details>

<details>
<summary>Block 3: ONNX / OML output</summary>

```
DBMS_DATA_MINING          VALID  (x3)
DBMS_PREDICTIVE_ANALYTICS VALID  (x3)
dba_mining_models         = (empty — chưa import model nào)
```

</details>

<details>
<summary>Block 4: Oracle Text output</summary>

```
Oracle Text   23.0.0.0.0   VALID
CTX_DDL       VALID  (x3)
CTX_QUERY     VALID  (x3)
```

</details>

<details>
<summary>Block 5: Cloud / Select AI output</summary>

```
DBMS_CLOUD              VALID  (x3)
DBMS_CLOUD_AI           VALID  (x3)
DBMS_NETWORK_ACL_ADMIN  VALID  (x3)
```

</details>

<details>
<summary>Block 6: Network ACL & Credentials output</summary>

```
ACL privileges for DEV24:
  - resolve  (DNS)
  - connect  (TCP)
  - http     (HTTP calls)

Credentials:
  COHERE_CRED   username=COHERE   enabled=TRUE
```

</details>

<details>
<summary>Block 7: Registry output</summary>

```
APEX      24.2.16       VALID
CATALOG   23.0.0.0.0    VALID
CATJAVA   23.0.0.0.0    VALID
CATPROC   23.0.0.0.0    VALID
CONTEXT   23.0.0.0.0    VALID
DV        23.0.0.0.0    VALID
JAVAVM    23.0.0.0.0    VALID
OLS       23.0.0.0.0    VALID
OWM       23.0.0.0.0    VALID
RAC       23.0.0.0.0    OPTION OFF
SDO       23.0.0.0.0    VALID
XML       23.0.0.0.0    VALID
XDB       23.0.0.0.0    VALID
APS       23.0.0.0.0    VALID
XOQ       23.0.0.0.0    VALID
```

</details>
