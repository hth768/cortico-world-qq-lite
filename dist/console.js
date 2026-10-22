// Cortico-QQ-World-lite/cortico-world-qq-lite/src/console/client.ts
var CONFIG = [
  { id: "qq", title: "QQ \u8FDE\u63A5", desc: "NapCat / OneBot v11 \u7684\u8FDE\u63A5\u65B9\u5F0F\u3002\u53CD\u5411\uFF08\u5BB9\u5668/\u5C40\u57DF\u7F51\u5E38\u7528\uFF09\u7531\u672C\u4E16\u754C\u76D1\u542C\u7AEF\u53E3\u7B49\u5F85 NapCat \u6765\u8FDE\u3002", group: "qq", prefix: "", topOnly: true },
  { id: "listen", title: "\u76D1\u542C\u540D\u5355", desc: "\u53EA\u5728\u8FD9\u4E9B\u7FA4/\u79C1\u804A\u91CC\u53C2\u4E0E\u5BF9\u8BDD\u3002\u7559\u7A7A\u8868\u793A\u4E0D\u9650\u5236\u3002", group: "listen", prefix: "", topOnly: true },
  { id: "deliver", title: "\u6295\u9012\u4E0E\u62C6\u5206", desc: "\u63A7\u5236\u6D88\u606F\u5982\u4F55\u62C6\u6761\u3001\u9650\u901F\u4E0E\u9644\u4EF6\u6295\u9012\u3002", group: "deliver", prefix: "", topOnly: true },
  { id: "prompt", title: "\u63D0\u793A\u8BCD\u6A21\u677F", desc: "\u5F53\u524D\u65F6\u95F4/\u65F6\u533A/\u81EA\u79F0/\u76D1\u542C\u540D\u5355\u7B49\u5360\u4F4D\u7B26\u4E0E\u7CFB\u7EDF\u63D0\u793A\u8BCD\u7247\u6BB5\u3002", group: "prompt", prefix: "", topOnly: true },
  { id: "sticker", title: "\u8868\u60C5\u5305", desc: "\u4ECE emojiDir \u6309\u6587\u4EF6\u540D\u5173\u952E\u8BCD\u5339\u914D\u5E76\u53D1\u9001\u8868\u60C5\u56FE\u7247\u3002", group: "sticker", prefix: "modules.sticker.", topOnly: false },
  { id: "groupspeak", title: "\u7FA4\u804A\u9650\u901F", desc: "\u9650\u5236\u673A\u5668\u4EBA\u5728\u7FA4\u5185\u7684\u53D1\u4FE1\u9891\u7387\uFF0C\u907F\u514D\u5237\u5C4F\u3002", group: "groupspeak", prefix: "modules.groupspeak.", topOnly: false },
  { id: "antiloop", title: "\u9632\u5237\u4E0E\u8BDD\u9898\u7ED3\u675F", desc: "\u62E6\u622A\u5237\u5C4F/\u590D\u8BFB\uFF0C\u5E76\u5F15\u5BFC\u673A\u5668\u4EBA\u8BDD\u9898\u6536\u5C3E\u3001\u4E0D\u8FC7\u5EA6\u7EED\u8BDD\u3002", group: "antiloop", prefix: "modules.antiloop.", topOnly: false },
  { id: "routine", title: "\u4F5C\u606F", desc: "\u8BBE\u5B9A\u4F11\u606F\u65F6\u6BB5\uFF1B\u4F11\u606F\u65F6\u6291\u5236\u54CD\u5E94\u5E76\u53EF\u9009\u64AD\u62A5\u665A\u5B89/\u65E9\u5B89\u3002", group: "routine", prefix: "modules.routine.", topOnly: false },
  { id: "festival", title: "\u8282\u65E5\u8282\u6C14", desc: "\u628A\u4ECA\u65E5\u8282\u65E5/\u8282\u6C14/\u519C\u5386\u6CE8\u5165\u63D0\u793A\u8BCD\u3002", group: "festival", prefix: "modules.festival.", topOnly: false },
  { id: "emotion", title: "\u60C5\u7EEA\u7CFB\u7EDF", desc: "\u611F\u77E5\u7FA4\u6C1B\u56F4\u5E76\u6CE8\u5165\u63D0\u793A\u8BCD\uFF0C\u8C03\u6574\u8BED\u6C14\u3002", group: "emotion", prefix: "modules.emotion.", topOnly: false },
  { id: "affinity", title: "\u597D\u611F\u5EA6", desc: "\u6309\u7528\u6237\u8BB0\u5F55\u5173\u7CFB\u5206\uFF0C\u6CE8\u5165\u8BED\u5883\u3002", group: "affinity", prefix: "modules.affinity.", topOnly: false },
  { id: "admin", title: "\u7FA4\u7BA1\u7406", desc: "\u4EC5\u767D\u540D\u5355\u5185\u7684\u7BA1\u7406\u5458\u53EF\u4F7F\u7528\u7981\u8A00/\u8E22\u4EBA/\u5C01\u7981\u3002", group: "admin", prefix: "modules.admin.", topOnly: false },
  { id: "reminder", title: "\u63D0\u9192\u4E0E\u8BB0\u4E8B", desc: "\u81EA\u7136\u8BED\u8A00\u5B9A\u65F6\u63D0\u9192\uFF0C\u5230\u70B9\u53D1\u5230\u7FA4/\u79C1\u804A\u3002", group: "reminder", prefix: "modules.reminder.", topOnly: false },
  { id: "notebook", title: "\u7B14\u8BB0\u672C", desc: "\u8BA9 AI \u8BB0\u5F55/\u68C0\u7D22\u81EA\u5DF1\u60F3\u8BB0\u7684\u4E1C\u897F\uFF08\u8BB0\u5FC6\u63D2\u4EF6\u542F\u7528\u65F6\u5199\u5165\u5176\u7B14\u8BB0\u5E93\uFF09\u3002", group: "notebook", prefix: "modules.notebook.", topOnly: false },
  { id: "history", title: "\u5386\u53F2\u67E5\u8BE2", desc: "\u56DE\u6EAF/\u68C0\u7D22 QQ \u6D88\u606F\u8BB0\u5F55\uFF08\u4F9D\u8D56\u6846\u67B6\u4E8B\u4EF6\u5B58\u50A8\uFF09\u3002", group: "history", prefix: "modules.history.", topOnly: false },
  { id: "voice", title: "\u8BED\u97F3\u6536\u53D1", desc: "\u8BED\u97F3\u8BC6\u522B\u4E0E\u5408\u6210\u3002\u4F9B\u5E94\u5546\uFF1Anative/custom/local\uFF08\u5DF2\u5254\u9664 voxcpm \u4E0E\u8BED\u97F3\u7535\u8BDD\uFF09\u3002", group: "voice", prefix: "modules.voice.", topOnly: false },
  { id: "qzone", title: "\u7A7A\u95F4\u52A8\u6001", desc: "\u6293\u53D6\u5E76\u6458\u8981 QQ \u7A7A\u95F4\u65B0\u9C9C\u4E8B\uFF0C\u4E3B\u52A8\u5206\u4EAB\u5230\u7FA4\u3002\u9700\u914D\u7F6E Cookie\u3002", group: "qzone", prefix: "modules.qzone.", topOnly: false },
  { id: "proactive", title: "\u4E3B\u52A8\u8BF4\u8BDD", desc: "\u5B9A\u65F6\u7ED3\u5408 LLM \u4E3B\u52A8\u627E\u7FA4\u804A\u5192\u6CE1/\u5206\u4EAB\u52A8\u6001\u3002", group: "proactive", prefix: "modules.proactive.", topOnly: false }
];
function isLongText(key, def) {
  if (def.type !== "string") return false;
  const k = key.toLowerCase();
  if (/prompt|greeting|farewell|notice|描述|systemprompt|voicedesc|voicedesign|extra|system/.test(k)) return true;
  if (def.description && def.description.length > 90) return true;
  return false;
}
function fmtVal(v) {
  if (v == null) return "\u2014";
  if (typeof v === "boolean") return v ? "\u5F00" : "\u5173";
  if (Array.isArray(v)) return v.length ? v.join(" / ") : "\uFF08\u7A7A\uFF09";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
function loadSchema(ctx, m) {
  return ctx.invoke("config", [m.group, m.prefix, m.topOnly]).catch(() => null);
}
function renderField(ctx, def, value, commit) {
  const ui = ctx.ui;
  const wrap = document.createElement("div");
  wrap.style.margin = "10px 0";
  const lab = document.createElement("div");
  lab.style.fontWeight = "600";
  lab.style.marginBottom = "3px";
  lab.textContent = def.title + (def.xHot ? "" : "\uFF08\u6539\u5B8C\u9700\u91CD\u542F\u751F\u6548\uFF09");
  wrap.appendChild(lab);
  let control;
  if (def.type === "boolean") {
    control = ui.checkbox("", { checked: !!value, onChange: (v) => commit(v) }).el;
  } else if (def.enum && def.enum.length) {
    const v = def.enum.includes(String(value)) ? String(value) : def.enum[0];
    control = ui.select({
      value: v,
      options: def.enum.map((e) => ({ value: e, label: e })),
      onChange: (v2) => commit(v2)
    });
  } else if (def.type === "integer" || def.type === "number") {
    control = ui.input({
      value: value == null ? "" : String(value),
      type: "number",
      onChange: (v) => commit(def.type === "integer" ? parseInt(v || "0", 10) : parseFloat(v || "0"))
    });
  } else if (isLongText(def.key, def)) {
    control = ui.textarea({ value: value == null ? "" : String(value), rows: 4, onChange: (v) => commit(v) });
  } else if (/secret|key|token/i.test(def.key) || /key|密钥|token/i.test(def.title)) {
    control = ui.input({ value: value == null ? "" : String(value), type: "password", onChange: (v) => commit(v) });
  } else {
    control = ui.input({ value: value == null ? "" : String(value), onChange: (v) => commit(v) });
  }
  wrap.appendChild(control);
  if (def.description) {
    const h = document.createElement("div");
    h.style.fontSize = "11px";
    h.style.opacity = "0.6";
    h.style.marginTop = "3px";
    h.style.lineHeight = "1.4";
    h.textContent = def.description;
    wrap.appendChild(h);
  }
  return wrap;
}
function makeConfigPanel(m) {
  return {
    mount(ctx) {
      const ui = ctx.ui;
      const toast = (msg) => {
        try {
          ui.toast(msg);
        } catch {
        }
      };
      let debounceTimer = null;
      const debounceCommit = (fn) => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(fn, 350);
      };
      const commit = (fn) => debounceCommit(fn);
      const sheet = ui.sheet({ title: m.title, desc: m.desc });
      const formWrap = document.createElement("div");
      const renderForm = (s) => {
        formWrap.replaceChildren();
        if (!s.properties.length) {
          const empty = document.createElement("div");
          empty.style.opacity = "0.6";
          empty.textContent = "\u8BE5\u6A21\u5757\u6682\u65E0\u53EF\u914D\u7F6E\u9879\u3002";
          formWrap.appendChild(empty);
          return;
        }
        const head = document.createElement("div");
        head.style.fontWeight = "700";
        head.style.margin = "4px 0 8px";
        head.textContent = s.title || "\u914D\u7F6E\u9879";
        formWrap.appendChild(head);
        const reload = () => {
          void loadSchema(ctx, m).then((s2) => {
            if (s2) renderForm(s2);
          });
        };
        for (const def of s.properties) {
          formWrap.appendChild(renderField(ctx, def, s.values[def.key], (v) => {
            void ctx.setConfig(m.group, { [def.key]: v }).then(() => toast("\u5DF2\u4FDD\u5B58\uFF1A" + (def.key.split(".").pop() || def.key))).catch((e) => toast("\u4FDD\u5B58\u5931\u8D25\uFF1A" + (e instanceof Error ? e.message : String(e)))).finally(reload);
          }));
        }
      };
      sheet.body.appendChild(formWrap);
      ctx.root.appendChild(sheet.el);
      void loadSchema(ctx, m).then((schema) => {
        if (!schema) {
          formWrap.replaceChildren();
          formWrap.textContent = "\u914D\u7F6E\u8BFB\u53D6\u5931\u8D25\uFF08\u6A21\u5757\u672A\u542F\u7528\u6216\u672A\u6CE8\u518C\u914D\u7F6E\u6BB5\uFF09\u3002";
        } else {
          renderForm(schema);
        }
      });
    }
  };
}
var modulesViewPanel = {
  mount(ctx) {
    const ui = ctx.ui;
    const sheet = ui.sheet({ title: "\u529F\u80FD\u6A21\u5757\u603B\u89C8", desc: "\u5DF2\u52A0\u8F7D\u529F\u80FD\u5305\u53CA\u5176\u914D\u7F6E\u6458\u8981\uFF1B\u9010\u9879\u914D\u7F6E\u89C1\u4E0A\u65B9\u5404\u5206\u7EC4\u9762\u677F\u3002" });
    sheet.body.textContent = "\u52A0\u8F7D\u529F\u80FD\u6A21\u5757\u2026";
    ctx.root.appendChild(sheet.el);
    void ctx.invoke("getModules").then(
      (r) => {
        const data = r;
        sheet.body.replaceChildren();
        const secs = data.sections || [];
        if (!secs.length) {
          const p = document.createElement("div");
          p.style.opacity = "0.6";
          p.textContent = "\uFF08\u672A\u52A0\u8F7D\u4EFB\u4F55\u529F\u80FD\u5305\uFF09";
          sheet.body.appendChild(p);
          return;
        }
        for (const sec of secs) {
          const block = document.createElement("div");
          block.style.margin = "8px 0";
          block.style.padding = "8px 10px";
          block.style.background = "rgba(127,127,127,0.10)";
          block.style.borderRadius = "6px";
          const h = document.createElement("div");
          h.style.fontWeight = "600";
          h.textContent = sec.title;
          block.appendChild(h);
          if (sec.description) {
            const d = document.createElement("div");
            d.style.fontSize = "11px";
            d.style.opacity = "0.6";
            d.style.marginTop = "2px";
            d.textContent = sec.description;
            block.appendChild(d);
          }
          const vals = data.values && data.values[sec.id];
          if (vals) {
            const vd = document.createElement("div");
            vd.style.fontSize = "12px";
            vd.style.marginTop = "4px";
            vd.style.fontFamily = "ui-monospace, monospace";
            vd.textContent = Object.entries(vals).map(([k, v]) => `${k}: ${fmtVal(v)}`).join("  \xB7  ");
            block.appendChild(vd);
          }
          sheet.body.appendChild(block);
        }
      },
      (e) => {
        sheet.body.textContent = "\u8BFB\u53D6\u5931\u8D25\uFF1A" + (e instanceof Error ? e.message : String(e));
      }
    );
  }
};
var rosterPanel = {
  mount(ctx) {
    const ui = ctx.ui;
    const sheet = ui.sheet({ title: "\u76D1\u542C\u540D\u5355", desc: "\u5F53\u524D\u76D1\u542C\u7684\u7FA4\u4E0E\u79C1\u804A\u3002\u6539\u52A8\u8D70 config.json\u3002" });
    sheet.body.textContent = "\u52A0\u8F7D\u76D1\u542C\u540D\u5355\u2026";
    ctx.root.appendChild(sheet.el);
    void ctx.invoke("getRoster").then(
      (r) => {
        const data = r;
        sheet.body.replaceChildren();
        const info = document.createElement("div");
        info.style.fontSize = "12px";
        info.style.opacity = "0.7";
        info.style.marginBottom = "8px";
        info.textContent = `selfId: ${data.selfId ?? "\u2014"}  selfName: ${data.selfName ?? "\u2014"}  \u7FA4\u6570: ${(data.groups || []).length}  \u79C1\u804A\u6570: ${(data.privates || []).length}`;
        sheet.body.appendChild(info);
        const sec = (title, items) => {
          const w = document.createElement("div");
          const h = document.createElement("div");
          h.style.fontWeight = "600";
          h.style.margin = "8px 0 4px";
          h.textContent = title + (items.length ? ` (${items.length})` : "");
          w.appendChild(h);
          if (!items.length) {
            const p = document.createElement("div");
            p.style.opacity = "0.5";
            p.textContent = "\uFF08\u7A7A\uFF09";
            w.appendChild(p);
          }
          for (const it of items) {
            const d = document.createElement("div");
            d.style.padding = "2px 0";
            d.style.fontSize = "13px";
            d.textContent = String(it);
            w.appendChild(d);
          }
          return w;
        };
        sheet.body.appendChild(sec("\u76D1\u542C\u7FA4", data.groups || []));
        sheet.body.appendChild(sec("\u76D1\u542C\u79C1\u804A", data.privates || []));
      },
      (e) => {
        sheet.body.textContent = "\u76D1\u542C\u540D\u5355\u8BFB\u53D6\u5931\u8D25\uFF1A" + (e instanceof Error ? e.message : String(e));
      }
    );
  }
};
var eventsPanel = {
  mount(ctx) {
    const ui = ctx.ui;
    const sheet = ui.sheet({ title: "\u5B9E\u65F6\u4E8B\u4EF6", desc: "QQ \u6D88\u606F\u4E0E\u901A\u77E5\u7684\u5B9E\u65F6\u6D41\uFF08\u79BB\u7EBF\u4E5F\u80FD\u770B\u5DF2\u5B58\u50A8\u7684\uFF09\u3002" });
    const status = document.createElement("div");
    status.style.fontSize = "11px";
    status.style.opacity = "0.6";
    status.style.marginBottom = "6px";
    status.textContent = "\u8FDE\u63A5\u4E2D\u2026";
    const list = document.createElement("div");
    list.style.maxHeight = "calc(100vh - 320px)";
    list.style.overflowY = "auto";
    sheet.body.append(status, list);
    ctx.root.appendChild(sheet.el);
    const handle = ctx.stream({
      open: () => {
        status.textContent = "\u25CF \u5DF2\u8FDE\u63A5";
      },
      close: (willRetry) => {
        status.textContent = willRetry ? "\u25CB \u5DF2\u65AD\u5F00\uFF0C\u91CD\u8FDE\u4E2D\u2026" : "\u25CB \u5DF2\u65AD\u5F00";
      },
      message: (text) => {
        let e = {};
        try {
          e = JSON.parse(text);
        } catch {
          e = { text };
        }
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.gap = "6px";
        row.style.padding = "3px 0";
        row.style.borderBottom = "1px solid rgba(127,127,127,0.12)";
        row.style.fontSize = "12px";
        const t = document.createElement("span");
        t.style.opacity = "0.5";
        t.style.flex = "0 0 auto";
        t.textContent = (e.ts || "").slice(11, 19);
        const ty = document.createElement("span");
        ty.style.flex = "0 0 auto";
        ty.style.opacity = "0.7";
        ty.textContent = e.type || "";
        const tx = document.createElement("span");
        tx.style.flex = "1";
        tx.textContent = e.text || "";
        row.append(t, ty, tx);
        list.appendChild(row);
        while (list.childElementCount > 300) list.removeChild(list.firstChild);
        list.scrollTop = list.scrollHeight;
      }
    });
    return handle;
  }
};
var modulesManagePanel = {
  mount(ctx) {
    const ui = ctx.ui;
    const sheet = ui.sheet({
      title: "\u529F\u80FD\u6A21\u5757",
      en: "Feature Modules",
      desc: "\u52FE\u9009\u542F\u7528\u529F\u80FD\u5305\uFF1A\u5185\u7F6E\u6A21\u5757\u6539\u52A8\u540E\u91CD\u542F\u751F\u6548\uFF1B\u5916\u90E8\u529F\u80FD\u5305\u5C06\u5B89\u88C5/\u542F\u7528\u6216\u505C\u7528\uFF08\u4FDD\u7559\u6587\u4EF6\uFF09\u3002"
    });
    const rowbar = ui.rowbar();
    const search = ui.input({ type: "search", placeholder: "\u641C\u7D22\u529F\u80FD\u5305\uFF08\u540D\u79F0 / \u63CF\u8FF0 / \u5173\u952E\u5B57\uFF09" });
    rowbar.append(search);
    sheet.body.appendChild(rowbar);
    const msg = ui.msgline();
    sheet.body.appendChild(msg);
    const builtinWrap = document.createElement("div");
    builtinWrap.style.marginTop = "6px";
    const extWrap = document.createElement("div");
    extWrap.style.marginTop = "10px";
    sheet.body.appendChild(builtinWrap);
    sheet.body.appendChild(extWrap);
    ctx.root.appendChild(sheet.el);
    let modulesValues = {};
    let extHits = [];
    let debounceTimer = null;
    const load = async () => {
      msg.textContent = "";
      const busy = ui.busy("\u52A0\u8F7D\u4E2D", "\u8BFB\u53D6\u529F\u80FD\u5305\u2026");
      try {
        const [mv, ext] = await Promise.all([
          ctx.invoke("getModulesView").catch(() => ({ sections: [], values: {} })),
          ctx.invoke("featureSearch", [search.value]).catch(() => [])
        ]);
        modulesValues = mv.values || {};
        extHits = ext;
        render(mv.sections || []);
      } catch (e) {
        msg.textContent = "\u52A0\u8F7D\u5931\u8D25\uFF1A" + (e instanceof Error ? e.message : String(e));
      } finally {
        busy.dispose();
      }
    };
    function sectionTitle(text) {
      const t = document.createElement("div");
      t.textContent = text;
      t.style.fontWeight = "700";
      t.style.fontSize = "12px";
      t.style.opacity = "0.7";
      t.style.margin = "8px 0 4px";
      return t;
    }
    function makeRow(labelText, sub, checked, onToggle) {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "10px";
      row.style.padding = "7px 6px";
      row.style.borderBottom = "1px solid rgba(127,127,127,0.12)";
      const cb = ui.checkbox({ label: "", checked });
      const label = document.createElement("div");
      label.style.flex = "1";
      const nm = document.createElement("div");
      nm.style.fontWeight = "600";
      nm.style.fontSize = "13px";
      nm.textContent = labelText;
      label.appendChild(nm);
      if (sub) {
        const dd = document.createElement("div");
        dd.style.fontSize = "11px";
        dd.style.opacity = "0.6";
        dd.textContent = sub;
        label.appendChild(dd);
      }
      row.append(cb, label);
      cb.onChange = onToggle;
      return { row, cb };
    }
    function render(builtinSections) {
      builtinWrap.replaceChildren();
      extWrap.replaceChildren();
      builtinWrap.appendChild(sectionTitle("\u5185\u7F6E\u529F\u80FD\u6A21\u5757\uFF08\u52FE\u9009\u542F\u7528\uFF0C\u91CD\u542F\u751F\u6548\uFF09"));
      if (!builtinSections.length) {
        const p = document.createElement("div");
        p.style.opacity = "0.6";
        p.textContent = "\uFF08\u65E0\u53EF\u914D\u7F6E\u5185\u7F6E\u6A21\u5757\uFF09";
        builtinWrap.appendChild(p);
      }
      for (const s of builtinSections) {
        const bucket = modulesValues[s.id] || {};
        const enabled = bucket.enabled !== false;
        const { row, cb } = makeRow(s.title + "\uFF08" + s.id + "\uFF09", "", enabled, async (v) => {
          cb.disabled = true;
          const next = { ...bucket, enabled: v };
          modulesValues[s.id] = next;
          try {
            await ctx.invoke("setModuleEnabled", [s.id, v]);
            ui.toast(v ? `\u5DF2\u542F\u7528 ${s.id}\uFF0C\u91CD\u542F\u540E\u751F\u6548` : `\u5DF2\u505C\u7528 ${s.id}\uFF0C\u91CD\u542F\u540E\u751F\u6548`, "ok");
          } catch (e) {
            ui.toast("\u64CD\u4F5C\u5931\u8D25\uFF1A" + (e instanceof Error ? e.message : String(e)), "bad");
          } finally {
            cb.disabled = false;
          }
        });
        builtinWrap.appendChild(row);
      }
      extWrap.appendChild(sectionTitle("\u5916\u90E8\u529F\u80FD\u5305\uFF08\u5B89\u88C5 / \u542F\u7528 / \u505C\u7528\uFF09"));
      if (!extHits.length) {
        const p = document.createElement("div");
        p.style.opacity = "0.6";
        p.textContent = "\uFF08\u65E0\u5339\u914D\uFF09";
        extWrap.appendChild(p);
      }
      for (const h of extHits) {
        const isEnabled = h.enabled;
        const { row, cb } = makeRow(h.name + (h.version ? "  v" + h.version : ""), h.description || "", isEnabled, async (v) => {
          cb.disabled = true;
          const busy = ui.busy("\u5904\u7406\u4E2D", (v ? "\u542F\u7528" : "\u505C\u7528") + " " + h.name + "\u2026");
          try {
            if (v) {
              const r = await ctx.invoke("featureInstall", [h.name, h.version]);
              if (r.message) ui.toast(r.message, "ok");
              else ui.toast(`\u5DF2\u542F\u7528 ${h.name}`, "ok");
            } else {
              const r = await ctx.invoke("featureDisable", [h.name]);
              if (r.message) ui.toast(r.message, "ok");
              else ui.toast(`\u5DF2\u505C\u7528 ${h.name}`, "ok");
            }
            await load();
          } catch (e) {
            ui.toast("\u64CD\u4F5C\u5931\u8D25\uFF1A" + (e instanceof Error ? e.message : String(e)), "bad");
          } finally {
            busy.dispose();
            cb.disabled = false;
          }
        });
        const pill = ui.pill(
          isEnabled ? "\u5DF2\u542F\u7528" : h.installed ? "\u5DF2\u5B89\u88C5" : "\u672A\u5B89\u88C5",
          isEnabled ? "on" : h.installed ? "info" : "off"
        );
        row.appendChild(pill);
        extWrap.appendChild(row);
      }
    }
    search.addEventListener("input", () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => void load(), 350);
    });
    void load();
  }
};
var featureMarketPanel = {
  mount(ctx) {
    const ui = ctx.ui;
    const root = ctx.root;
    const sheet = ui.sheet({
      title: "\u529F\u80FD\u6A21\u5757\u5E02\u573A",
      en: "Feature Market",
      desc: "\u4ECE npm \u53D1\u73B0\u5E76\u5B89\u88C5 hth-qq-* \u529F\u80FD\u5305\uFF1B\u5DF2\u5B89\u88C5\u7684\u5305\u53EF\u542F\u7528 / \u505C\u7528 / \u5378\u8F7D\u3002\u6539\u52A8\u540E\u9700\u91CD\u542F\u8FDB\u7A0B\u751F\u6548\u3002"
    });
    root.appendChild(sheet.el);
    const rowbar = ui.rowbar();
    const input = ui.input({ type: "search", placeholder: "\u641C\u7D22\u529F\u80FD\u5305\uFF08\u540D\u79F0 / \u63CF\u8FF0 / \u5173\u952E\u5B57\uFF09" });
    const searchBtn = ui.button("\u641C\u7D22", { variant: "primary", onClick: () => void doSearch(input.value) });
    rowbar.append(input, searchBtn);
    sheet.body.appendChild(rowbar);
    const msg = ui.msgline();
    sheet.body.appendChild(msg);
    const table = ui.table({ head: ["\u529F\u80FD\u5305", "\u7248\u672C", "\u7B80\u4ECB", "\u72B6\u6001", "\u64CD\u4F5C"] });
    table.el.style.marginTop = "8px";
    sheet.body.appendChild(table.el);
    let currentHits = [];
    async function getEnabled() {
      const m = await ctx.invoke("getFeatures").catch(() => null);
      return new Set(m?.features ?? []);
    }
    function renderHits(hits, enabled) {
      table.clear(hits.length ? void 0 : "\u6CA1\u6709\u5339\u914D\u7684\u529F\u80FD\u5305");
      for (const h of hits) {
        const isEnabled = enabled.has(h.name);
        const nameEl = ui.h("span");
        nameEl.textContent = h.name;
        const statusEl = ui.pill(
          isEnabled ? "\u5DF2\u542F\u7528" : h.installed ? "\u5DF2\u5B89\u88C5" : "\u672A\u5B89\u88C5",
          isEnabled ? "on" : h.installed ? "info" : "off"
        );
        const actionCell = document.createElement("div");
        actionCell.style.display = "flex";
        actionCell.style.gap = "6px";
        actionCell.appendChild(ui.button(
          isEnabled ? "\u505C\u7528" : h.installed ? "\u542F\u7528" : "\u5B89\u88C5",
          {
            variant: isEnabled ? "danger" : "primary",
            size: "sm",
            onClick: () => {
              if (isEnabled) void doDisable(h.name);
              else void doInstall(h.name, h.version);
            }
          }
        ));
        if (h.installed) {
          actionCell.appendChild(ui.button("\u5378\u8F7D", {
            variant: "ghost",
            size: "sm",
            onClick: () => void doUninstall(h.name)
          }));
        }
        table.addRow([nameEl, h.version, h.description || "\u2014", statusEl, actionCell]);
      }
    }
    async function doSearch(q) {
      msg.textContent = "";
      const busy = ui.busy("\u6B63\u5728\u641C\u7D22", "\u68C0\u7D22\u529F\u80FD\u5305\u2026");
      try {
        const hits = await ctx.invoke("featureSearch", [q]);
        const enabled = await getEnabled();
        currentHits = hits;
        renderHits(hits, enabled);
      } catch (e) {
        msg.textContent = "\u641C\u7D22\u5931\u8D25\uFF1A" + (e instanceof Error ? e.message : String(e));
      } finally {
        busy.dispose();
      }
    }
    async function doInstall(name, version) {
      const busy = ui.busy("\u6B63\u5728\u5B89\u88C5", `${version ? "\u5B89\u88C5" : "\u542F\u7528"} ${name}\u2026`);
      try {
        const r = await ctx.invoke("featureInstall", [name, version]);
        ui.toast(r.message, "ok");
        const enabled = await getEnabled();
        renderHits(currentHits, enabled);
      } catch (e) {
        ui.toast("\u64CD\u4F5C\u5931\u8D25\uFF1A" + (e instanceof Error ? e.message : String(e)), "bad");
      } finally {
        busy.dispose();
      }
    }
    async function doDisable(name) {
      const busy = ui.busy("\u6B63\u5728\u505C\u7528", `\u505C\u7528 ${name}\u2026`);
      try {
        const r = await ctx.invoke("featureDisable", [name]);
        ui.toast(r.message, "ok");
        const enabled = await getEnabled();
        renderHits(currentHits, enabled);
      } catch (e) {
        ui.toast("\u505C\u7528\u5931\u8D25\uFF1A" + (e instanceof Error ? e.message : String(e)), "bad");
      } finally {
        busy.dispose();
      }
    }
    async function doUninstall(name) {
      const ok = await ui.confirm({ title: "\u5378\u8F7D\u529F\u80FD\u5305", body: `\u5C06\u628A ${name} \u4ECE\u529F\u80FD\u6E05\u5355\u79FB\u9664\u5E76\u5220\u9664\u5305\u6587\u4EF6\uFF0C\u91CD\u542F\u540E\u4E0D\u518D\u52A0\u8F7D\uFF08\u82E5\u53EA\u60F3\u505C\u7528\u4FDD\u7559\u6587\u4EF6\uFF0C\u53EF\u5728\u529F\u80FD\u6A21\u5757\u9762\u677F\u53D6\u6D88\u52FE\u9009\uFF09\u3002` });
      if (!ok) return;
      const busy = ui.busy("\u6B63\u5728\u5378\u8F7D", `\u5378\u8F7D ${name}\u2026`);
      try {
        const r = await ctx.invoke("featureUninstall", [name]);
        ui.toast(r.message, "ok");
        const enabled = await getEnabled();
        renderHits(currentHits, enabled);
      } catch (e) {
        ui.toast("\u5378\u8F7D\u5931\u8D25\uFF1A" + (e instanceof Error ? e.message : String(e)), "bad");
      } finally {
        busy.dispose();
      }
    }
    void doSearch("");
  }
};
var panels = {};
for (const m of CONFIG) panels[m.id] = makeConfigPanel(m);
panels["modules"] = modulesManagePanel;
panels["modules-view"] = modulesViewPanel;
panels["roster"] = rosterPanel;
panels["events"] = eventsPanel;
panels["feature-market"] = featureMarketPanel;
var bundle = { panels };
var client_default = bundle;
export {
  client_default as default
};
