# 急性気道感染症（かぜ・咽頭炎・扁桃炎・副鼻腔炎・気管支炎）（自院メモ）

- **ガイドライン要約**: [respiratory-infections/README.md](https://github.com/keiyousya/clinical-guidelines/blob/main/respiratory-infections/README.md)
- 各資料の自院メモはこのディレクトリの下に、ガイドライン側と同じパスで置く

## 当院の前提（2026-10 時点）

| 項目 | 状況 |
|---|---|
| 迅速検査キット | インフルエンザ/COVID-19、溶連菌（strep）、マイコプラズマ（在庫管理で発注対象） |
| 院内在庫の抗菌薬 | サワシリンカプセル 250 mg、オーグメンチン配合錠 250RS、セファレキシン錠 250 mg、レボフロキサシン 500 mg、セフトリアキソン静注用 1 g（在庫管理DB、2026-10-16 確認） |
| 院内在庫にないもの | **経口第3世代セフェム（メイアクトなど）とマクロライド（クラリス・ジスロマック）**。使うなら院外処方 |
| 対症療法の在庫 | アセトアミノフェン 300・500 mg、ロキソプロフェン、カルボシステイン、デキストロメトルファン、コデイン、トラネキサム酸、ビラスチン、SP トローチ |
| 胸部X線 | 未導入（[喘息の自院メモ](../asthma/README.md)の前提と同じ） |

在庫が変わったらこの表を直す。

## 急性鼻副鼻腔炎（当院の方針）

2026-10-16 に院長と決めた方針。根拠: [鼻科学会 GL 追補版](https://github.com/keiyousya/clinical-guidelines/blob/main/respiratory-infections/jrs-acute-rhinosinusitis-gl2010-suppl/summary.md)、[鼻副鼻腔炎診療の手引き2024](https://github.com/keiyousya/clinical-guidelines/blob/main/respiratory-infections/jrs-rhinosinusitis-tebiki2024/summary.md)、[感染症学会 提言2022](https://github.com/keiyousya/clinical-guidelines/blob/main/respiratory-infections/jsid-rti-teigen-2022/01-rhinosinusitis.md)、[厚労省 手引き 第四版](https://github.com/keiyousya/clinical-guidelines/blob/main/respiratory-infections/mhlw-amr-tebiki-2026/03-acute-rhinosinusitis.md)

1. **細菌性を疑う条件**: 10日以上続く（10-day mark）、いったん良くなってから再び悪化する（double sickening）、高熱と膿性鼻汁が3〜4日以上続く。それ以外はかぜとして対症療法。**膿性鼻汁だけでは細菌性と判断しない**
2. **重症度**: 鼻科学会のスコア（鼻漏・顔面痛・鼻汁/後鼻漏、軽症1–3／中等症4–6／重症7–8）
3. **軽症**: 抗菌薬なしで**5日間経過観察**。悪化して中等症以上になれば抗菌薬
4. **中等症以上**: **サワシリン高用量 1回500 mg（250 mg × 2カプセル）1日3回 5日間**
5. **5日で効かなければ**: 第3世代経口セフェム高用量（メイアクトMS 1回200 mg 1日3回など、院外処方）か、レスピラトリーキノロン（院内在庫はレボフロキサシン 500 mg 1日1回）に替える。全体で7〜10日まで
6. **最初から第二選択（BLNAR を想定）を考える人**: 繰り返している、結膜炎と中耳炎を合併している、少し前に AMPC を使った
7. **歯性上顎洞炎を疑う人**（片側、歯痛・歯科治療歴）: 嫌気性菌が関わるので通常の方針とは別に扱い、歯科と連携する。抗菌薬の選び方は今回の GL 要約にはほとんど書かれていない
8. **すぐ紹介**（眼窩内・頭蓋内合併症）: 眼瞼の腫れ、眼球突出、複視・視力低下、激しい頭痛、項部硬直、意識の変化、前額部の腫れ

### サワシリン単剤でよい理由（院長との確認、2026-10-16）

- 主な起因菌は肺炎球菌・インフルエンザ菌（莢膜のない NTHi で、Hib ではない）・モラクセラ。急性では嫌気性菌は主役ではない（長引いた例・歯性・合併症で関わる）
- 肺炎球菌のペニシリン耐性は PBP の変化なので、**高用量の AMPC で乗り越えられる**。合併症を起こしやすい肺炎球菌を確実に押さえる
- 日本のインフルエンザ菌の耐性は **BLNAR（PBP の変化）が主体**で、β-ラクタマーゼ産生株は少ない。**クラブラン酸を足しても BLNAR には効かない**ので、CVA/AMPC にしても効果が増えにくい（β-ラクタマーゼ産生株が多い米国では CVA/AMPC が第一選択）
- モラクセラはほぼ β-ラクタマーゼを作るが、病原性が弱く自然に治ることが多い
- 大半は自然に治るので、最初から全部をカバーせず、**5日ごとの効果判定で外れた例を拾う**

## 急性咽頭炎・扁桃炎（当院の方針）

- **溶連菌が陽性なら、サワシリン 1回500 mg 1日3回 10日間**（院長、2026-10-16）。リウマチ熱予防のため、良くなっても飲み切るよう説明する
  - 今日の治療指針2026「A群溶血性レンサ球菌感染症」はクリンダマイシン併用を挙げるが、これは STSS・壊死性筋膜炎の考え方で、通常の咽頭炎には使わない（[要約](https://github.com/keiyousya/clinical-guidelines/blob/main/respiratory-infections/konnichi-chiryo-2026/03-gas-pharyngitis-mononucleosis.md)）
- **溶連菌の迅速検査をする基準**（院長、2026-10-16）: **McIsaac 2点以上で検査、1点以下は検査しない**。抗菌薬は**検査陽性のときだけ**で、4点以上でも検査なしでは出さない
  - McIsaac: 38℃以上の発熱／咳がない／圧痛を伴う前頸部リンパ節腫脹／白苔を伴う扁桃炎（各1点）＋年齢補正（3〜14歳 +1、15〜44歳 0、45歳以上 −1）
  - 1点以下でも検査する: 家族（同居）に溶連菌の人がいる、リウマチ熱の既往
  - 点数に関係なく検査しない: 咳・鼻汁・嗄声・口内炎などウイルス性がはっきりしている
  - 根拠: 2点以上で検査するのは [感染症学会 提言2022](https://github.com/keiyousya/clinical-guidelines/blob/main/respiratory-infections/jsid-rti-teigen-2022/02-pharyngotonsillitis.md) と米国家庭医学会（[今日の治療指針 付録1](https://github.com/keiyousya/clinical-guidelines/blob/main/respiratory-infections/konnichi-chiryo-2026/06-appendix-outpatient-antibiotics.md)）。検査陽性に限って治療するのは [厚労省 手引き](https://github.com/keiyousya/clinical-guidelines/blob/main/respiratory-infections/mhlw-amr-tebiki-2026/04-acute-pharyngitis.md)・[IDSA](https://github.com/keiyousya/clinical-guidelines/blob/main/respiratory-infections/idsa-gas-pharyngitis-2025/summary.md)。ACP/CDC は3点以上で検査とする（検査数はさらに減るが、当院は迅速キットがあるので2点からにした）。4点でも陽性は約半分なので、検査なしで出すと半分が不要な処方になる
- 伝染性単核球症（後頸部・耳介後部のリンパ節腫脹、脾腫、異型リンパ球）を疑えば、AMPC は出さない（皮疹）
- **白苔・膿栓があっても（いわゆる化膿性扁桃炎）、見た目だけでは細菌性と判断しない**。ウイルス（特に EBV・アデノウイルス）でも出る。方針は溶連菌の検査結果で決める。高熱・白苔で溶連菌陰性なら、伝染性単核球症を積極的に考える

### 扁桃周囲炎・扁桃周囲膿瘍を疑ったら（院長、2026-10-16）

正式な診断基準はない。臨床所見で疑い、穿刺で膿が引ければ膿瘍と確定、広がりは造影 CT で見る（[今日の治療指針 04](https://github.com/keiyousya/clinical-guidelines/blob/main/respiratory-infections/konnichi-chiryo-2026/04-peritonsillar-deep-neck-abscess.md)）。当院は穿刺も造影 CT もできないので、**疑うかどうか**で動く。

- **疑うサイン**: **片側性**（片側の扁桃・軟口蓋の腫れ、片側の下顎角直下の圧痛）、唾が飲み込めないほどの咽頭痛、**開口障害**、**含み声**、**口蓋垂の健側への偏位**、腫脹部の波動
- **どれかがあれば当日中に耳鼻咽喉科へ紹介**。扁桃周囲炎か膿瘍かの区別（穿刺・造影 CT）と排膿は耳鼻科で行う
- 扁桃周囲炎・膿瘍は細菌感染（溶連菌＋口腔内の嫌気性菌。全国サーベイランスでは嫌気性菌が約7割）なので、**溶連菌の検査結果に関係なく抗菌薬が必要**。院内にセフトリアキソン 1 g と点滴セットはあるが、膿瘍を除外しないまま点滴でつなぐより評価できる施設へ送るのを優先する
- **救急へ**（喉頭浮腫・急性喉頭蓋炎・深頸部膿瘍・レミエール症候群）: 呼吸困難、吸気性喘鳴、前傾姿勢、流涎、頸部の腫れ、片側の頸部の痛み・腫れと高熱・敗血症の徴候
