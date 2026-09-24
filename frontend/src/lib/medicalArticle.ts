// 病気の解説記事（/articles 配下）の構造化データ。
// 医療記事は監修者と更新日を明示すると信頼性の評価につながるため、
// MedicalWebPage と BreadcrumbList を記事ごとに出力する。

export const SITE_URL = "https://koutoudai-yugata-naika.clinic";

export const SUPERVISOR = {
  name: "田村 慧人",
  jobTitle: "院長",
  url: `${SITE_URL}/doctor`,
};

// 本番はディレクトリ形式で配信され、スラッシュなしの URL は 301 になる。
// canonical・サイトマップと揃えるため末尾スラッシュ付きの URL にする
const pageUrl = (path: string) => `${SITE_URL}${path.endsWith("/") ? path : `${path}/`}`;

// frontmatter の "2026.07.17" 形式を ISO 形式（2026-07-17）にする
export const toIsoDate = (date: string) => date.replaceAll(".", "-");

interface Crumb {
  name: string;
  path: string;
}

interface Params {
  path: string;
  headline: string;
  description: string;
  about: string;
  datePublished?: string;
  dateModified?: string;
  crumbs: Crumb[];
}

export function buildMedicalArticleSchema({ path, headline, description, about, datePublished, dateModified, crumbs }: Params) {
  const url = pageUrl(path);
  const physician = {
    "@type": "Physician",
    name: SUPERVISOR.name,
    jobTitle: SUPERVISOR.jobTitle,
    url: SUPERVISOR.url,
    worksFor: { "@id": SITE_URL },
  };
  return [
    {
      "@context": "https://schema.org",
      "@type": "MedicalWebPage",
      "@id": url,
      url,
      name: headline,
      headline,
      description,
      inLanguage: "ja",
      about: { "@type": "MedicalCondition", name: about },
      audience: { "@type": "PatientAudience" },
      author: physician,
      reviewedBy: physician,
      publisher: { "@id": SITE_URL },
      ...(datePublished && { datePublished: toIsoDate(datePublished) }),
      ...(dateModified && { dateModified: toIsoDate(dateModified), lastReviewed: toIsoDate(dateModified) }),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [{ name: "ホーム", path: "/" }, ...crumbs].map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        item: pageUrl(c.path),
      })),
    },
  ];
}
