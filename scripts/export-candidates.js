#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DATA_DIR = '/Users/zhanrui/obsidian/展瑞人力资源/工人档案/data';
const JSON_FILES = [
  '简历列表_2026-03-13.json',
  '腾讯云小程序人员.json',
  '候选人完整合并_20260228.json',
  '达利食品员工.json',
  '候选人合并_20260226.json',
  '劳务用工人员明细.json',
  '员工入职信息.json',
  '在职名单_20260301.json'
];

const HEADERS = [
  '姓名', '手机号', '身份证号', '性别', '年龄',
  '应聘职位/岗位', '来源', '状态', '期望工作地址/地区',
  '反馈状态', '入职日期', '部门', '公司'
];

const unique = new Map();

function readJson(fp) {
  try { return JSON.parse(fs.readFileSync(fp, 'utf-8')); }
  catch { return null; }
}

function toArray(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return Object.values(data);
}

function pickFirst(item, fields) {
  for (const f of fields) {
    const v = item[f];
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
  return '';
}

function extract(item, source) {
  const phone = pickFirst(item, ['手机', '手机号', '电话', '联系电话', 'phone', 'mobile']);
  if (!phone) return null;
  return [{
    姓名: pickFirst(item, ['姓名', 'name', '姓名*', '员工姓名']),
    手机号: phone,
    身份证号: pickFirst(item, ['身份证号', '身份证', 'id_card', 'idCard']),
    性别: pickFirst(item, ['性别', 'gender']),
    年龄: pickFirst(item, ['年龄', 'age']),
    应聘职位: pickFirst(item, ['应聘职位', '岗位', 'position', '职位', '工种', '岗位名称']),
    来源: source,
    状态: pickFirst(item, ['状态', 'status', '求职状态', '员工状态']),
    期望工作地址: pickFirst(item, ['期望工作地址', '工作地址', 'address', '地区', '期望地区']),
    反馈状态: pickFirst(item, ['反馈状态', 'feedback', '跟进状态']),
    入职日期: pickFirst(item, ['入职日期', '进厂日期', 'entry_date', 'hireDate']),
    部门: pickFirst(item, ['部门', 'department', '所在部门']),
    公司: pickFirst(item, ['公司', '企业', 'company', '单位'])
  }];
}

function parseMarkdownTable(filePath, source) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  let inTable = false, headers = [], rows = [];

  for (const line of lines) {
    const l = line.trim();
    if (l.startsWith('|---')) { inTable = true; continue; }
    if (!inTable) continue;

    if (headers.length === 0 && l.startsWith('|')) {
      headers.push(...l.split('|').filter(c => c.trim()).map(c => c.trim()));
      continue;
    }

    if (l.startsWith('|') && l.endsWith('|')) {
      const cols = l.split('|').filter(c => c.trim());
      if (cols.length >= headers.length) {
        const row = {};
        for (let i = 0; i < headers.length; i++) {
          row[headers[i]] = cols[i]?.trim() || '';
        }
        rows.push(row);
      }
    }
  }
  return rows;
}

function writeCSV(outPath, candidates) {
  const headers = HEADERS.join(',');
  const rows = candidates.map(c =>
    HEADERS.map(f => `"${String(c[f] || '').replace(/"/g, '""')}"`).join(',')
  );
  fs.writeFileSync(outPath, [headers, ...rows].join('\n'), 'utf-8');
}

async function main() {
  console.log('开始导出候选人数据...\n');
  const all = [];

  // JSON 文件
  for (const f of JSON_FILES) {
    const fp = path.join(DATA_DIR, f);
    const data = readJson(fp);
    if (!data) continue;
    const src = f.replace('.json', '').replace(/_2026-03-13|_20260226|_20260301|_20260228/g, '');
    let cnt = 0;

    if (Array.isArray(data)) {
      for (const item of data) {
        const cand = extract(item, src);
        if (cand) { all.push(...cand); cnt++; }
      }
    } else {
      if (data.employees && Array.isArray(data.employees)) {
        for (const item of data.employees) {
          const cand = extract(item, src);
          if (cand) { all.push(...cand); cnt++; }
        }
      } else if (data.candidates && Array.isArray(data.candidates)) {
        for (const item of data.candidates) {
          const cand = extract(item, src);
          if (cand) { all.push(...cand); cnt++; }
        }
      } else {
        for (const k of Object.keys(data)) {
          const cand = extract(data[k], src);
          if (cand) { all.push(...cand); cnt++; }
        }
      }
    }
    console.log(`📁 ${src}: ${cnt} 条（含手机号）`);
  }

  // Markdown 文件
  const mdPath = path.join(DATA_DIR, '..', '候选人列表', '全部候选人.md');
  if (fs.existsSync(mdPath)) {
    const mdRows = parseMarkdownTable(mdPath, '全部候选人（聚合）');
    console.log(`📁 全部候选人（Markdown）: ${mdRows.length} 条`);
    for (const row of mdRows) {
      const cand = extract(row, '全部候选人（聚合）');
      if (cand) all.push(...cand);
    }
  }

  // 去重
  console.log(`\n🔄 去重前总计: ${all.length} 条`);
  for (const c of all) {
    const p = c.手机号.trim();
    if (p && !unique.has(p)) unique.set(p, c);
  }
  const dedup = Array.from(unique.values());
  console.log(`✅ 去重后: ${dedup.length} 条（移除重复手机号 ${all.length - dedup.length} 个）\n`);

  // 输出 CSV
  const today = new Date().toISOString().slice(0, 10);
  const outPath = path.join(DATA_DIR, `候选人导出_${today}.csv`);
  writeCSV(outPath, dedup);
  console.log(`✅ 导出成功: ${outPath}\n`);

  // 统计
  console.log('📊 数据统计:');
  console.log(`   总记录数: ${dedup.length}`);
  console.log(`   含身份证: ${dedup.filter(c => c.身份证号).length} 条`);
  const srcCount = {};
  dedup.forEach(c => { srcCount[c.来源] = (srcCount[c.来源] || 0) + 1; });
  console.log(`   来源分布:`);
  Object.entries(srcCount).forEach(([s, n]) => console.log(`     - ${s}: ${n}`));
}

main().catch(e => { console.error('失败:', e); process.exit(1); });
