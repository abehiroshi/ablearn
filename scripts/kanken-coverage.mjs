// 漢検 準2級の配当漢字カバレッジ集計（計画39）。
// 使い方: node scripts/kanken-coverage.mjs
//
// public/content/kanken/ の全問題（出題文・解答・カードの表裏）から
// 準2級配当漢字の使用状況を集計し、「出題済み n/328」と未出題の字一覧を出す。
// CI ゲートには含めない（カバー率は品質ゲートではなく、次のセットを作るときの道具）。
//
// 配当字リストの出典（2026-06-12 取得・照合）:
//   漢検協会 級別漢字表（2020年度改定後）
//   https://www.kanken.or.jp/kanken/outline/data/outline_degree_national_list20200217.pdf
//   ページ12-13「準２級」から抽出した328字。漢字辞典オンライン（kanji.jitenon.jp/cat/kyu02j）等
//   3つの独立ソースと機械照合して完全一致を確認済み。
//   ※ 参考値: 公式の改定（級の移動）があったら作り直す
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const PRE2_KANJI =
  "亜尉逸姻韻畝疫謁猿凹翁虞渦禍靴寡稼蚊拐懐劾涯垣核殻嚇括喝渇褐轄且缶陥患堪棺款閑寛憾還艦頑飢宜偽擬糾窮拒享挟恭矯暁菌琴謹襟吟隅勲薫茎渓蛍慶傑嫌献謙繭顕懸弦呉碁江肯侯洪貢溝衡購拷剛酷昆懇唆詐砕宰栽斎索酢桟傘肢嗣賜璽漆遮蛇酌爵珠儒囚臭愁酬醜汁充渋銃叔淑粛塾俊准殉循庶緒叙升抄肖尚宵症祥渉訟硝粧詔奨彰償礁浄剰壌醸津唇娠紳診刃迅甚帥睡枢崇据杉斉逝誓析拙窃仙栓旋践遷薦繊禅漸租疎塑壮荘捜挿曹喪槽霜藻妥堕惰駄泰濯但棚痴逐秩嫡衷弔挑眺釣懲勅朕塚漬坪呈廷邸亭貞逓偵艇泥迭徹撤悼搭棟筒謄騰洞督凸屯軟尼妊忍寧把覇廃培媒賠伯舶漠肌鉢閥煩頒妃披扉罷猫賓頻瓶扶附譜侮沸雰憤丙併塀幣弊偏遍浦泡俸褒剖紡朴僕撲堀奔麻摩磨抹岬銘妄盲耗厄愉諭癒唯悠猶裕融庸窯羅酪痢履柳竜硫虜涼僚寮倫累塁戻鈴賄枠";

if (PRE2_KANJI.length !== 328) {
  console.error(`NG: 配当字リストが ${PRE2_KANJI.length} 字（328字のはず）`);
  process.exit(1);
}

// kanken コンテンツの全テキストを集める（問題文・選択肢・解答・カード表裏・解説）
const ROOT = "public/content/kanken";
let allText = "";
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".json")) allText += readFileSync(p, "utf8");
  }
};
walk(ROOT);

const used = [...PRE2_KANJI].filter((ch) => allText.includes(ch));
const unused = [...PRE2_KANJI].filter((ch) => !allText.includes(ch));

console.log(`準2級配当漢字カバレッジ: 出題済み ${used.length}/328`);
console.log("");
console.log("未出題の配当字:");
// 10字ごとに折り返して眺めやすく
for (let i = 0; i < unused.length; i += 10) {
  console.log("  " + unused.slice(i, i + 10).join(" "));
}
