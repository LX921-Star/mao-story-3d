#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
毛泽东生平时空叙事 —— 可视化内容编辑后台
================================================
零依赖：只用 Python 标准库 + Node 构建命令。

功能：
  - 网页表单编辑所有历史事件（年份/地点/标题/简介/氛围）
  - 新增、删除、上下移动事件
  - 编辑主题色
  - 保存后自动重新构建网站，线上页面自动更新

启动：
  python3 editor/server.py
然后浏览器打开 http://localhost:5600
"""

import json
import os
import re
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

# ---------------------------------------------------------------- 路径配置
ROOT = Path(__file__).resolve().parent.parent          # 项目根目录
FRONTEND = ROOT / "frontend"
EVENT_FILE = FRONTEND / "src" / "data" / "eventPoints.ts"
CSS_FILE = FRONTEND / "src" / "styles" / "epic.css"
DIST = FRONTEND / "dist"

HOST = os.environ.get("EDITOR_HOST", "0.0.0.0")
PORT = int(os.environ.get("EDITOR_PORT", "5600"))
# 简单口令保护，防止误改；可通过环境变量修改
TOKEN = os.environ.get("EDITOR_TOKEN", "mao2025")

_build_lock = threading.Lock()
_build_state = {"running": False, "ok": None, "msg": "尚未构建", "time": ""}


# ---------------------------------------------------------------- 数据读写
def read_events():
    """从 eventPoints.ts 中解析出事件数组（宽松解析，兼容手写格式）。"""
    text = EVENT_FILE.read_text(encoding="utf-8")
    # 取 export const eventPoints ... = [ ... ]; 之间的内容
    m = re.search(r"export\s+const\s+eventPoints\s*:\s*EventPoint\[\]\s*=\s*\[(.*)\];",
                  text, re.S)
    if not m:
        raise RuntimeError("未能在 eventPoints.ts 中找到事件数组")
    body = m.group(1)

    events = []
    # 逐个匹配 { ... } 块（事件内部不含嵌套大括号）
    for block in re.finditer(r"\{([^{}]*)\}", body):
        seg = block.group(1)
        ev = {}
        for key in ["year", "name", "location", "lat", "lng", "title", "brief", "bgDesc"]:
            # 字符串字段：key: 'xxx'  或 key: "xxx"
            sm = re.search(key + r"\s*:\s*'((?:[^'\\]|\\.)*)'", seg)
            if not sm:
                sm = re.search(key + r'\s*:\s*"((?:[^"\\]|\\.)*)"', seg)
            if sm:
                raw = sm.group(1)
                # 还原 JS 字符串转义
                raw = raw.replace("\\'", "'").replace('\\"', '"')
                raw = raw.replace("\\n", "\n").replace("\\\\", "\\")
                ev[key] = raw
            else:
                nm = re.search(key + r"\s*:\s*(-?[\d.]+)", seg)
                if nm:
                    # 保留原始文本（含尾零），未编辑时原样写回，避免产生无意义 diff
                    ev[key] = nm.group(1)
                    ev["__raw_" + key] = nm.group(1)
                else:
                    ev[key] = ""
        if ev.get("year") or ev.get("title"):
            events.append(ev)
    return events


def js_str(s):
    """把 Python 字符串安全地写成 JS 单引号字符串。"""
    s = str(s)
    s = s.replace("\\", "\\\\")   # 反斜杠先转义
    s = s.replace("'", "\\'")     # 单引号
    s = s.replace("\r\n", "\\n").replace("\n", "\\n").replace("\r", "\\n")
    return "'" + s + "'"


def fmt_num(v, default_digits=2):
    """把经纬度格式化为稳定的数值字符串：保留原始精度，去掉多余尾零。"""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return "0"
    # 用 repr 保留浮点精度，再去掉无意义的尾零
    txt = repr(f)
    if "e" in txt or "E" in txt:
        txt = ("%.6f" % f).rstrip("0").rstrip(".")
    return txt if txt else "0"


def write_events(events):
    """按原风格重写 eventPoints.ts 的数组部分，保留文件头注释与末尾导出。"""
    text = EVENT_FILE.read_text(encoding="utf-8")
    header = text.split("export const eventPoints", 1)[0]
    # 保留数组之后的内容（例如 export default eventPoints;）
    tail = ""
    if "];" in text.split("export const eventPoints", 1)[1]:
        after = text.split("export const eventPoints", 1)[1].split("];", 1)[1]
        tail = after

    lines = []
    for ev in events:
        lines.append("  {")
        lines.append("    year: %s," % js_str(ev.get("year", "")))
        lines.append("    name: %s," % js_str(ev.get("name", "")))
        lines.append("    location: %s," % js_str(ev.get("location", "")))
        lat_s = ev.get("__raw_lat") if ev.get("__raw_lat") is not None else fmt_num(ev.get("lat"))
        lng_s = ev.get("__raw_lng") if ev.get("__raw_lng") is not None else fmt_num(ev.get("lng"))
        lines.append("    lat: %s, lng: %s," % (lat_s, lng_s))
        lines.append("    title: %s," % js_str(ev.get("title", "")))
        lines.append("    brief:")
        lines.append("      %s," % js_str(ev.get("brief", "")))
        lines.append("    bgDesc:")
        lines.append("      %s," % js_str(ev.get("bgDesc", "")))
        lines.append("  },")
    body = "\n".join(lines)

    content = (
        header
        + "export const eventPoints: EventPoint[] = [\n"
        + body
        + "\n];"
        + tail
    )
    if not content.endswith("\n"):
        content += "\n"
    EVENT_FILE.write_text(content, encoding="utf-8")


def read_colors():
    """读取 epic.css 顶部的主题色变量。"""
    text = CSS_FILE.read_text(encoding="utf-8")
    keys = ["--epic-gold", "--epic-gold-bright", "--epic-gold-soft",
            "--epic-red", "--epic-red-deep", "--epic-ink", "--epic-panel"]
    out = {}
    for k in keys:
        m = re.search(re.escape(k) + r"\s*:\s*([^;]+);", text)
        out[k] = m.group(1).strip() if m else ""
    return out


def write_colors(colors):
    text = CSS_FILE.read_text(encoding="utf-8")
    for k, v in colors.items():
        if not re.match(r"^--epic-[\w-]+$", k):
            continue
        text = re.sub(re.escape(k) + r"\s*:\s*[^;]+;", "%s: %s;" % (k, v), text, count=1)
    CSS_FILE.write_text(text, encoding="utf-8")


# ---------------------------------------------------------------- 构建
def run_build():
    """执行前端构建，并重新生成单文件 html。"""
    with _build_lock:
        _build_state.update(running=True, ok=None, msg="正在构建…")
        try:
            # 1) vite build
            env = dict(os.environ)
            env["PATH"] = env.get("PATH", "") + ":/root/.nvm/versions/node/v22.13.1/bin"
            r = subprocess.run(
                ["npm", "run", "build"],
                cwd=str(FRONTEND), env=env,
                capture_output=True, text=True, timeout=300,
            )
            if r.returncode != 0:
                _build_state.update(running=False, ok=False,
                                    msg="构建失败：" + (r.stderr or r.stdout)[-1500:])
                return
            # 2) 生成单文件（若内联脚本存在）
            inline = ROOT / ".codebuddy" / "artifact" / "2f8a7d30-9c21-4f0b-1d43-0d009f517000" / "inline.py"
            if inline.exists():
                subprocess.run([sys.executable, str(inline), str(ROOT / "mao-story.html")],
                               cwd=str(ROOT), capture_output=True, text=True, timeout=120)
            import time
            _build_state.update(running=False, ok=True,
                                msg="构建成功，网站已更新", time=time.strftime("%H:%M:%S"))
        except Exception as e:  # noqa
            _build_state.update(running=False, ok=False, msg="构建异常：%s" % e)


# ---------------------------------------------------------------- HTTP 服务
PAGE = r"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>内容编辑后台 · 毛泽东生平时空叙事</title>
<style>
  :root{--gold:#e8c86a;--red:#c41e20;--bg:#0d0a0c;--panel:#181114;--line:#3a2a2e;--txt:#e8e0d8}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--txt);font:14px/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
  header{position:sticky;top:0;z-index:9;background:linear-gradient(180deg,#1a1114,#120c0e);border-bottom:1px solid var(--line);padding:14px 22px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
  header h1{margin:0;font-size:17px;color:var(--gold);font-weight:600;letter-spacing:.5px}
  header .sp{flex:1}
  button{cursor:pointer;border:1px solid var(--line);background:#241820;color:var(--txt);padding:8px 14px;border-radius:8px;font-size:13px;transition:.15s}
  button:hover{border-color:var(--gold);color:var(--gold)}
  button.primary{background:linear-gradient(135deg,#c41e20,#8a1418);border-color:#d94a4c;color:#fff;font-weight:600}
  button.primary:hover{filter:brightness(1.15);color:#fff}
  button.ghost{background:transparent}
  .wrap{max-width:960px;margin:0 auto;padding:22px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:14px}
  .card .hd{display:flex;align-items:center;gap:10px;margin-bottom:12px}
  .card .hd .idx{width:26px;height:26px;flex:none;border-radius:50%;background:rgba(196,30,32,.25);color:var(--gold);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}
  .card .hd .ttl{font-weight:600;color:var(--gold)}
  .card .hd .sp{flex:1}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .grid .full{grid-column:1/-1}
  label{display:block;font-size:12px;color:#9c8c8a;margin-bottom:4px}
  input,textarea{width:100%;background:#0f0b0d;border:1px solid var(--line);border-radius:8px;color:var(--txt);padding:8px 10px;font:13px/1.5 inherit;font-family:inherit}
  input:focus,textarea:focus{outline:none;border-color:var(--gold)}
  textarea{resize:vertical;min-height:64px}
  .colors{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}
  .color-item{display:flex;align-items:center;gap:8px}
  .color-item input[type=color]{width:34px;height:34px;padding:0;border-radius:8px;border:1px solid var(--line);background:#000}
  .color-item input[type=text]{font-size:12px;padding:6px 8px}
  .bar{position:fixed;left:0;right:0;bottom:0;background:#150e11;border-top:1px solid var(--line);padding:12px 22px;display:flex;gap:12px;align-items:center}
  .bar .sp{flex:1}
  .tip{font-size:12px;color:#8f8280}
  .toast{position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#241820;border:1px solid var(--gold);color:var(--gold);padding:10px 18px;border-radius:10px;font-size:13px;opacity:0;pointer-events:none;transition:.3s;z-index:99}
  .toast.show{opacity:1}
  .ok{color:#7fd18a}.err{color:#ff9a9a}
  h2.sec{color:var(--gold);font-size:14px;margin:26px 0 10px;letter-spacing:.5px}
</style>
</head>
<body>
<header>
  <h1>🖋 内容编辑后台</h1>
  <span class="tip">毛泽东生平时空叙事 · 3D 地图</span>
  <span class="sp"></span>
  <button class="ghost" onclick="addEvent()">＋ 新增事件</button>
  <button class="primary" onclick="save()">保存并更新网站</button>
</header>

<div class="wrap">
  <h2 class="sec">历史事件（共 <span id="cnt">0</span> 个）</h2>
  <div id="events"></div>

  <h2 class="sec">主题配色</h2>
  <div class="card"><div class="colors" id="colors"></div>
    <p class="tip" style="margin:10px 0 0">提示：改动颜色后点右上角"保存并更新网站"即可生效。</p>
  </div>
</div>

<div class="bar">
  <span class="tip" id="status">就绪</span>
  <span class="sp"></span>
  <button class="ghost" onclick="location.reload()">放弃改动</button>
  <button class="primary" onclick="save()">保存并更新网站</button>
</div>
<div class="toast" id="toast"></div>

<script>
var EVENTS = [], COLORS = {}, COLOR_LABELS = {
  '--epic-gold':'主金色','--epic-gold-bright':'亮金色（标题）','--epic-gold-soft':'柔和金（正文）',
  '--epic-red':'主红色','--epic-red-deep':'深红','--epic-ink':'底色','--epic-panel':'面板背景'
};
var FIELDS = [
  ['year','年份',''],['name','地点简称',''],['location','完整地点','full'],
  ['lat','纬度',''],['lng','经度',''],['title','事件标题',''],
  ['brief','简介','full'],['bgDesc','时代氛围','full']
];

function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');}

function render(){
  var box=document.getElementById('events'); box.innerHTML='';
  document.getElementById('cnt').textContent=EVENTS.length;
  EVENTS.forEach(function(ev,i){
    var c=document.createElement('div'); c.className='card';
    var h='<div class="hd"><span class="idx">'+(i+1)+'</span>'+
      '<span class="ttl">'+esc(ev.year||'（无年份）')+' · '+esc(ev.name||ev.location||'未命名')+'</span>'+
      '<span class="sp"></span>'+
      '<button onclick="move('+i+',-1)">↑</button>'+
      '<button onclick="move('+i+',1)">↓</button>'+
      '<button onclick="del('+i+')">删除</button></div><div class="grid">';
    FIELDS.forEach(function(f){
      var k=f[0],lab=f[1],wide=f[2]==='full';
      var val=esc(ev[k]);
      h+='<div class="'+(wide?'full':'')+'"><label>'+lab+'</label>'+
        (wide?'<textarea oninput="upd('+i+',\''+k+'\',this.value)">'+val+'</textarea>'
             :'<input oninput="upd('+i+',\''+k+'\',this.value)" value="'+val+'">')+'</div>';
    });
    h+='</div>';
    c.innerHTML=h; box.appendChild(c);
  });
}

function renderColors(){
  var box=document.getElementById('colors'); box.innerHTML='';
  Object.keys(COLORS).forEach(function(k){
    var v=COLORS[k]||'#000000';
    var hex=/^#[0-9a-fA-F]{6}$/.test(v.trim())?v.trim():'#000000';
    var d=document.createElement('div'); d.className='color-item';
    d.innerHTML='<input type="color" value="'+hex+'" oninput="updColor(\''+k+'\',this.value,this)">'+
      '<div style="flex:1"><label>'+esc(COLOR_LABELS[k]||k)+'</label>'+
      '<input type="text" value="'+esc(v)+'" oninput="updColor(\''+k+'\',this.value)"></div>';
    box.appendChild(d);
  });
}

function upd(i,k,v){EVENTS[i][k]=v;}
function updColor(k,v,src){
  COLORS[k]=v;
  if(src && src.type==='color'){
    var txt=src.parentNode.querySelector('input[type=text]'); if(txt)txt.value=v;
  }
}
function del(i){ if(confirm('确定删除第 '+(i+1)+' 个事件？')){EVENTS.splice(i,1);render();} }
function move(i,d){ var j=i+d; if(j<0||j>=EVENTS.length)return; var t=EVENTS[i];EVENTS[i]=EVENTS[j];EVENTS[j]=t; render(); }
function addEvent(){
  EVENTS.push({year:'',name:'',location:'',lat:0,lng:0,title:'新事件',brief:'',bgDesc:''});
  render(); window.scrollTo(0,document.body.scrollHeight);
}
function toast(msg,cls){var t=document.getElementById('toast');t.textContent=msg;t.className='toast show '+(cls||'');setTimeout(function(){t.className='toast';},2600);}

function save(){
  document.getElementById('status').textContent='保存中…';
  // 清理内部字段，并同步经纬度原始值
  var payload=EVENTS.map(function(e){
    var o={}; FIELDS.forEach(function(f){o[f[0]]=e[f[0]];});
    return o;
  });
  fetch('api/save',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({token:TOKEN,events:payload,colors:COLORS})})
  .then(function(r){return r.json();})
  .then(function(j){
    if(!j.ok){toast('❌ '+(j.error||'保存失败'),'err');document.getElementById('status').textContent='保存失败';return;}
    toast('✅ 已保存，正在重新构建网站…','ok');
    document.getElementById('status').textContent='已保存，构建中…';
    poll();
  }).catch(function(e){toast('❌ 网络错误','err');});
}
function poll(){
  fetch('api/build-status').then(function(r){return r.json();}).then(function(j){
    document.getElementById('status').textContent=j.msg;
    if(j.running){setTimeout(poll,1500);}
    else if(j.ok){toast('🎉 网站已更新完成','ok');}
    else if(j.ok===false){toast('⚠ 构建失败，请看下方提示','err');}
  });
}

var TOKEN=new URLSearchParams(location.search).get('token')||'mao2025';
fetch('api/data?token='+encodeURIComponent(TOKEN)).then(function(r){return r.json();}).then(function(j){
  if(j.error){document.body.innerHTML='<div style="padding:60px;text-align:center;color:#ff9a9a">访问口令不正确，或服务未就绪。<br><br>'+esc(j.error)+'</div>';return;}
  EVENTS=j.events;COLORS=j.colors;render();renderColors();
});
</script>
</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False)
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass  # 静默

    def do_GET(self):
        u = urlparse(self.path)
        if u.path in ("/", "/index.html"):
            return self._send(200, PAGE, "text/html; charset=utf-8")
        if u.path == "/api/data":
            return self._send(200, {"events": read_events(), "colors": read_colors()})
        if u.path == "/api/build-status":
            return self._send(200, _build_state)
        return self._send(404, {"error": "not found"})

    def do_POST(self):
        u = urlparse(self.path)
        if u.path != "/api/save":
            return self._send(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(n).decode("utf-8"))
            if payload.get("token") != TOKEN:
                return self._send(403, {"ok": False, "error": "口令不正确"})
            events = payload.get("events", [])
            colors = payload.get("colors", {})
            if not isinstance(events, list) or not events:
                return self._send(400, {"ok": False, "error": "事件列表为空，已取消保存"})
            write_events(events)
            if colors:
                write_colors(colors)
            threading.Thread(target=run_build, daemon=True).start()
            return self._send(200, {"ok": True})
        except Exception as e:  # noqa
            return self._send(500, {"ok": False, "error": str(e)})


if __name__ == "__main__":
    print("=" * 56)
    print("  内容编辑后台已启动")
    print("  打开： http://localhost:%d/?token=%s" % (PORT, TOKEN))
    print("  口令： %s   （可用环境变量 EDITOR_TOKEN 修改）" % TOKEN)
    print("=" * 56)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
