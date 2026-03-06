#!/usr/bin/env bash
set -euo pipefail

PROMPT=${1:-"请根据需求拆分任务。只输出一个 JSON 对象，不要 markdown 代码块，不要解释文本；若信息不足先输出 form_request。"}
MIN_TASKS=${2:-3}

SCHEMA_TEMPLATE='{"type":"object","required":["type"],"properties":{"type":{"type":"string","enum":["form_request","task_split"]},"question":{"type":"string"},"formSchema":{"type":"object"},"status":{"type":"string","enum":["DONE"]},"tasks":{"type":"array","items":{"type":"object"}}},"additionalProperties":false,"allOf":[{"if":{"type":"object","properties":{"type":{"const":"form_request"}},"required":["type"]},"then":{"required":["type","formSchema"],"properties":{"type":{"const":"form_request"},"question":{"type":"string"},"formSchema":{"type":"object","required":["formId","title","fields"],"properties":{"formId":{"type":"string","minLength":1},"title":{"type":"string","minLength":1},"description":{"type":"string"},"submitText":{"type":"string"},"fields":{"type":"array","minItems":1,"maxItems":1,"items":{"type":"object","required":["name","label","type"],"properties":{"name":{"type":"string","minLength":1},"label":{"type":"string","minLength":1},"type":{"type":"string","enum":["text","textarea","select","multiselect","number","checkbox","radio","date","slider"]},"required":{"type":"boolean"},"placeholder":{"type":"string"},"options":{"type":"array","items":{"type":"object","required":["label","value"],"properties":{"label":{"type":"string"},"value":{}},"additionalProperties":true}},"validation":{"type":"object","additionalProperties":true}},"additionalProperties":true}}},"additionalProperties":true}}}},{"if":{"type":"object","properties":{"type":{"const":"task_split"}},"required":["type"]},"then":{"required":["type","status","tasks"],"properties":{"type":{"const":"task_split"},"status":{"const":"DONE"},"tasks":{"type":"array","minItems":__MIN_TASKS__,"items":{"type":"object","required":["title","description","priority","implementationSteps","testSteps","acceptanceCriteria"],"properties":{"title":{"type":"string","minLength":1},"description":{"type":"string","minLength":1},"priority":{"type":"string","enum":["high","medium","low"]},"implementationSteps":{"type":"array","minItems":1,"items":{"type":"string","minLength":1}},"testSteps":{"type":"array","minItems":1,"items":{"type":"string","minLength":1}},"acceptanceCriteria":{"type":"array","minItems":1,"items":{"type":"string","minLength":1}}},"additionalProperties":false}}}}}]}'

SCHEMA=${SCHEMA_TEMPLATE/__MIN_TASKS__/$MIN_TASKS}

echo "== Claude CLI raw json output =="
RAW_OUTPUT=$(claude -p "$PROMPT" --output-format json --json-schema "$SCHEMA")
printf '%s\n' "$RAW_OUTPUT"

echo
echo "== Extracted candidate output =="
node -e '
const raw = process.argv[1];
try {
  const parsed = JSON.parse(raw);
  const items = Array.isArray(parsed) ? parsed : [parsed];
  const pick = [...items].reverse().find(i => i && typeof i === "object" && i.structured_output)
    ?? [...items].reverse().find(i => i && typeof i === "object" && i.result)
    ?? parsed;
  if (pick.structured_output) {
    console.log(JSON.stringify(pick.structured_output, null, 2));
  } else if (typeof pick.result === "string") {
    console.log(pick.result);
  } else {
    console.log(JSON.stringify(pick, null, 2));
  }
} catch (err) {
  console.error("parse failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
}
' "$RAW_OUTPUT"
