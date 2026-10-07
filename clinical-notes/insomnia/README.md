# 不眠症・入眠困難（自院メモ）

- **ガイドライン要約**: [insomnia/README.md](https://github.com/keiyousya/clinical-guidelines/blob/main/insomnia/README.md)
- 各資料の自院メモはこのディレクトリの下に、ガイドライン側と同じパスで置いている

## 不眠の訴えをみたら（早見）

当院の運用メモ。各資料の要約と自院メモをつないだもので、どれか1つの GL の推奨ではない。

### 1. 評価（薬を出す前に）

- **日中の障害（眠気・集中力・気分）があるか**を確認する。週3回以上・3ヵ月以上なら慢性不眠症。日中の障害がない「眠れない」には薬を出さない（[ESRS 01](https://github.com/keiyousya/clinical-guidelines/blob/main/insomnia/esrs-european-gl2023/01-diagnosis-assessment.md)、[2013 01](https://github.com/keiyousya/clinical-guidelines/blob/main/insomnia/jssr-hypnotics-gl2013/01-overview-algorithm.md)）
- **入眠困難か、中途覚醒か、早朝覚醒か**を聞く。薬の選び方が変わる（[AASM 2017](https://github.com/keiyousya/clinical-guidelines/blob/main/insomnia/aasm-pharmacologic-2017/summary.md)）
- 除外・併存を確認する
  - いびき・無呼吸 → **睡眠時無呼吸**（睡眠薬の前に検査）
  - 脚のむずむず → **RLS**（フェリチン）
  - 早朝覚醒・気分の落ち込み → **うつ病**
  - 夜型化 → **概日リズムのずれ**
  - **カフェイン・寝酒**、薬剤（ステロイド、β遮断薬など）、頻尿・痛み・痒み
  - 詳しくは [ESRS 01](https://github.com/keiyousya/clinical-guidelines/blob/main/insomnia/esrs-european-gl2023/01-diagnosis-assessment.md)、[2013 03](https://github.com/keiyousya/clinical-guidelines/blob/main/insomnia/jssr-hypnotics-gl2013/03-comorbidities-special-populations.md)
- **睡眠日誌（1〜2週）**をつけてもらう

### 2. 非薬物療法（第一選択）

- **CBT-I が第一選択**（ESRS: A、2013年版 Q30: A、ACP・AASM も同じ）
- 内科外来では、**睡眠制限と刺激制御**に絞った簡易版を行う。**睡眠衛生指導だけで終わらせない**（ESRS は単独での睡眠衛生指導を勧めていない）
- 手順は [ESRS 02](esrs-european-gl2023/02-cbt-i.md) の自院メモ
- **CBT-I と薬を最初から併用するより、CBT-I 単独**（[AASM 2026](https://github.com/keiyousya/clinical-guidelines/blob/main/insomnia/aasm-combination-2026/summary.md)、Conditional）。ただし早く眠れることを重視する人は併用を選んでよい

### 3. 薬を出すなら

| 状況 | 当院の第一候補 | 根拠・注意 |
|---|---|---|
| 入眠困難・中途覚醒どちらも | **デエビゴ（レンボレキサント）5 mg を就寝直前**（在庫あり） | DORA は3ヵ月まで推奨（ESRS: A）、長期も個別に判断（ESRS: A）。急にやめても離脱・反跳がない（[Hajak 2026](https://github.com/keiyousya/clinical-guidelines/blob/main/insomnia/hajak-deprescribing-2026/summary.md)）。今日の治療指針2026 の処方例の筆頭も**デエビゴ 5 mg**（[今日の治療指針 01](https://github.com/keiyousya/clinical-guidelines/blob/main/insomnia/konnichi-chiryo-2026/01-insomnia.md)）。ただし ESRS が評価した DORA はダリドレキサントだけで、AASM 2017 で推奨があるのはスボレキサント（維持）だけ |
| 入眠困難が主で、依存の心配を最小にしたい | ロゼレム（ラメルテオン） | AASM 2017 では入眠困難に推奨（WEAK）。**ESRS では非推奨（A）**。効果は小さい（入眠が約9分早まる程度）と説明し、効かなければ漫然と続けない。夜型化が主体の人には理屈が合う |
| 短期（4週以内）に限ってすぐ効かせたい | マイスリー・ルネスタ | ESRS: 4週以内（A）。**長期で始めない**。高齢者は避ける |
| 出さない | BZ（ハルシオンなど）の新規処方、トラゾドン・クエチアピン（不眠目的）、抗ヒスタミン薬 | トラゾドンは AASM が反対、抗精神病薬・抗ヒスタミン薬は ESRS が反対（A）。**クエチアピンは糖尿病に禁忌** |

- **定期の採血・心電図は不要**（求める GL・添付文書の記載なし）。肝機能は定期採血の結果で確認する。**トラゾドンを定期で使うときだけ心電図**（添付文書に定期的な心電図検査の記載あり）。詳しくは [zolpidem-handover.md](zolpidem-handover.md) の「定期の採血・心電図」
- 処方時に、**3ヵ月を目安に見直す**ことを合意しておく。**翌朝の運転**、**飲酒と併用しない**ことを伝える
- 国内の DORA は**4剤**: デエビゴ（半減期約50時間）、ベルソムラ（10〜12.5時間）、クービビック（6〜10時間）、ボルズィ（ボルノレキサント、約2時間）（[今日の治療指針 02](https://github.com/keiyousya/clinical-guidelines/blob/main/insomnia/konnichi-chiryo-2026/02-hypnotics-comparison.md)）
- **CYP3A 阻害薬**（クラリスロマイシン、イトラコナゾール・ボリコナゾール、ジルチアゼム・ベラパミルなど）に注意する。**ベルソムラ・クービビック・ボルズィは強い阻害薬と併用禁忌**、**デエビゴは中程度以上の阻害薬との併用で 2.5 mg に減量**。ロゼレムは**フルボキサミン禁忌**、キノロン系で濃度が上がる。夕方外来で抗菌薬を出すときに睡眠薬を確認する

### 4. 減薬・切替え（前医の BZ・Z薬を引き継いだときなど）

- **前医のゾルピデム（ほかの Z 薬・BZ も同じ）を継続希望で来たとき**の手順（初診の確認項目・方針の分け方・漸減表・デエビゴへの切替え・患者さんへの説明）: [zolpidem-handover.md](zolpidem-handover.md)

- **改善して1〜2か月たったら減量・中止を検討する**（[今日の治療指針 01](https://github.com/keiyousya/clinical-guidelines/blob/main/insomnia/konnichi-chiryo-2026/01-insomnia.md)）。始めるときに「良くなればやめられる」と説明しておく
- **急にやめない**。BZ・Z薬は、外来では **2〜4週ごとに1/4ずつ**（今日の治療指針）を標準にする。本人の希望が強く短期使用なら **1〜2週ごとに25%減**まで速めてよい。年単位・高用量・高齢なら **2〜4週ごとに5〜10%減**（[Hajak 2026](https://github.com/keiyousya/clinical-guidelines/blob/main/insomnia/hajak-deprescribing-2026/summary.md)、[Palagini 2025](https://github.com/keiyousya/clinical-guidelines/blob/main/insomnia/palagini-switching-2025/summary.md)、[2013 05](https://github.com/keiyousya/clinical-guidelines/blob/main/insomnia/jssr-hypnotics-gl2013/05-goal-tapering.md)）
- **デエビゴへのクロステーパ**: 5 mg（持ち越しが心配なら 2.5 mg）から重ね、BZ を減らす
- DORA・ロゼレムは**漸減不要**で、翌晩から切り替えてよい
- **減薬と並行して簡易 CBT-I** を行う（成功率が上がる）
- エチゾラム（デパス）は資料に出てこないが、BZ と同じに扱う（当院の判断）
- 向精神薬の多剤投与の減算、BZ 受容体作動薬を1年以上同じ量で処方したときの減算があるので、点数表で確認する
