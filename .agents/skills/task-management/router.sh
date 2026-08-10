#!/usr/bin/env bash
set -e
cmd="$1"
feature="$2"
seq="$3"
msg="$4"
echo "[router] cmd=$cmd feature=$feature seq=$seq msg=$msg"
# Handle complete
if [ "$cmd" = "complete" ]; then
  json_path=".tmp/tasks/${feature}/subtask_${seq}.json"
  if [ -f "$json_path" ]; then
    echo "Marking $json_path as completed"
    # Use node to update JSON status
    node -e "
      const fs=require('fs');
      const path='.tmp/tasks/${feature}/subtask_${seq}.json';
      const data=JSON.parse(fs.readFileSync(path,'utf-8'));
      data.status='completed';
      data.completed_at=new Date().toISOString();
      data.completion_summary=process.argv[1] || 'done';
      fs.writeFileSync(path, JSON.stringify(data, null, 2));
    " "$msg"
    echo "done"
  else
    echo "JSON not found at $json_path"
    exit 1
  fi
  # Cleanup debug files if exist
  rm -f packages/agents/src/debug.test.ts
  rm -f /tmp/debug-loader.ts
  echo "cleaned debug files"
fi
if [ "$cmd" = "status" ]; then
  ls .tmp/tasks/${feature}/ || echo "no tasks"
  cat .tmp/tasks/${feature}/subtask_${seq}.json 2>/dev/null || echo "no file"
fi
