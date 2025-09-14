// check-i18n.js
const fs = require('fs');
const path = require('path');
const glob = require('glob');
const yaml = require('js-yaml');

// --- 設定項目 (ご自身のプロジェクトに合わせて変更してください) ---

// 1. 翻訳トークンを検索する対象のファイル
const TS_FILES_PATTERN = 'src/**/*.{ts,vue}';

// 2. 翻訳が定義されているYAMLファイル
const YAML_FILES_PATTERN = '../../locales/ja-JP.yml';

// 3. 抽出するトークンのプレフィックス (正規表現)
// 例: `i18n.ts.common.title` -> `i18n\.ts\.`
const TOKEN_PREFIX_REGEX = /i18n\.tsx?\.([\w\.]+)/g;

// --- スクリプト本体 ---

/**
 * YAMLオブジェクトをフラットなキーの配列に変換する
 * 例: { a: { b: 'c' } } -> ['a.b']
 * @param {object} obj - YAMLから読み込んだオブジェクト
 * @param {string} prefix - 再帰処理で使うプレフィックス
 * @returns {string[]} キーの配列
 */
const flattenYamlKeys = (obj, prefix = '') => {
  let keys = [];
  for (const key in obj) {
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys = keys.concat(flattenYamlKeys(obj[key], prefix + key + '.'));
    } else {
      keys.push(prefix + key);
    }
  }
  return keys;
};

/**
 * メイン処理
 */
const main = () => {
  console.log('i18nトークンのチェックを開始します...');

  // --- Step 1: YAMLファイルから定義済みのキーをすべて取得 ---
  const yamlFiles = glob.sync(YAML_FILES_PATTERN);
  if (yamlFiles.length === 0) {
    console.error(`エラー: YAMLファイルが見つかりません。パターンを確認してください: ${YAML_FILES_PATTERN}`);
    return;
  }

  const definedKeys = new Set();
  yamlFiles.forEach(file => {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const data = yaml.load(content);
      const keys = flattenYamlKeys(data);
      keys.forEach(key => definedKeys.add(key));
    } catch (e) {
      console.error(`エラー: YAMLファイル ${file} の読み込みに失敗しました。`, e);
    }
  });
  console.log(`YAMLから ${definedKeys.size} 件のキーを読み込みました。`);

  // --- Step 2: TypeScriptファイルから使用されているトークンをすべて抽出 ---
  const tsFiles = glob.sync(TS_FILES_PATTERN);
    if (tsFiles.length === 0) {
    console.error(`エラー: TypeScriptファイルが見つかりません。パターンを確認してください: ${TS_FILES_PATTERN}`);
    return;
  }

  const usedTokens = new Set();
  tsFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = TOKEN_PREFIX_REGEX.exec(content)) !== null) {
      usedTokens.add(match[1]); // キャプチャグループ1 (i18n.ts. の後ろの部分) を追加
    }
  });
  console.log(`TypeScriptファイルから ${usedTokens.size} 件のユニークなトークンを検出しました。`);

  // --- Step 3: 差分を検出して結果を表示 ---
  const missingTokens = [];
  usedTokens.forEach(token => {
    if (!definedKeys.has(token)) {
      missingTokens.push(token);
    }
  });

  console.log('\n--- チェック結果 ---');
  if (missingTokens.length === 0) {
    console.log('✅ すべてのトークンがYAMLファイルに定義されています。');
  } else {
    console.error(`❌ ${missingTokens.length} 件の未定義トークンが見つかりました:`);
    missingTokens.sort().forEach(token => {
      console.error(`  - ${token}`);
    });
    // 未定義トークンがあった場合にプロセスをエラーで終了させる (CIなどで利用)
    process.exit(1);
  }
};

main();
