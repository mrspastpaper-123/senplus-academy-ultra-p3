export type TopicCardData = { title: string; icon: "person" | "plant" | "lungs" | "water" | "energy" | "microbe" | "earth" | "book" };
export function getTopicCard(text: string): TopicCardData | null {
  const match = text.match(/(?:圖卡|卡片)標題(?:是|為)?[：:\s]*[「“"]([^」”"\n]{1,80})[」”"]/u);
  if (!match || !/(?:哪(?:一)?張文字卡|哪(?:一)?張卡片|配對|配上|放在.{0,12}標題)/u.test(text)) return null;
  const title = match[1].trim();
  if (!title) return null;
  const icon: TopicCardData["icon"] =
    /青春期|成長|情緒|衞生|衛生|生殖|身體|健康/u.test(title) ? "person" :
    /植物|種子|花朵|光合作用|發芽/u.test(title) ? "plant" :
    /呼吸|肺/u.test(title) ? "lungs" :
    /水|蒸發|凝結|溶解/u.test(title) ? "water" :
    /電|能量|磁|熱|光/u.test(title) ? "energy" :
    /微生物|細菌|真菌|酵母/u.test(title) ? "microbe" :
    /環境|地球|回收|可持續|污染/u.test(title) ? "earth" : "book";
  return { title, icon };
}
