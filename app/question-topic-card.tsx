import { getTopicCard, type TopicCardData } from "./question-topic-card-data";
function TopicPicture({ icon }: { icon: TopicCardData["icon"] }) {
  return <svg viewBox="0 0 240 160" aria-hidden="true" focusable="false">
    <rect x="12" y="8" width="216" height="144" rx="25" fill="#edf7f5" />
    <circle cx="190" cy="36" r="12" fill="#f7dfa0" />
    <g stroke="#347d83" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
    {icon === "person" ? <><circle cx="120" cy="48" r="19" fill="#f5d8b6" /><path d="M92 126V91Q92 72 110 72H130Q148 72 148 91V126Z" fill="#7dbbb2" /><path d="M106 126V145M134 126V145M92 91L78 116M148 91L162 116" fill="none" /><path d="M111 43Q120 36 129 43" fill="none" /></> :
    icon === "plant" ? <><path d="M120 131V55" fill="none" /><path d="M120 87Q78 90 80 54Q117 53 120 87ZM120 109Q161 111 165 72Q126 70 120 109Z" fill="#89c59a" /><path d="M89 132H151" /></> :
    icon === "lungs" ? <><path d="M120 29V69M120 55L101 76M120 55L139 76" fill="none" /><path d="M105 61Q84 64 70 104Q63 127 89 132Q107 135 107 112V70ZM135 61Q156 64 170 104Q177 127 151 132Q133 135 133 112V70Z" fill="#b3d6d8" /></> :
    icon === "water" ? <path d="M120 28Q107 48 87 78Q55 129 120 137Q185 129 153 78Z" fill="#9ccfe9" /> :
    icon === "energy" ? <><path d="M131 25L89 89H117L109 137L153 70H126Z" fill="#f2d47e" /></> :
    icon === "microbe" ? <><ellipse cx="120" cy="82" rx="45" ry="35" fill="#b6d5a1" /><path d="M75 66L62 59M76 96L62 106M100 47L96 34M140 47L146 34M164 65L177 57M164 99L179 108M103 117L98 133M139 117L145 132" /><circle cx="104" cy="76" r="5" fill="#347d83" /><circle cx="137" cy="89" r="7" fill="#347d83" /></> :
    icon === "earth" ? <><circle cx="120" cy="82" r="52" fill="#9ccfe9" /><path d="M88 41L111 46L106 66L126 83L113 102L89 89L76 65M149 47L140 66L157 86L145 111L155 119" fill="#a6cd9c" /></> :
    <><path d="M120 53Q93 35 67 47V125Q94 115 120 131Q146 115 173 125V47Q147 35 120 53Z" fill="#fff" /><path d="M120 53V131M81 65L106 71M81 85L106 91M135 71L159 65M135 91L159 85" fill="none" /></>}
    </g>
  </svg>;
}
export function QuestionTopicCard({ text }: { text: string }) {
  const card = getTopicCard(text);
  if (!card) return null;
  return <figure className="question-topic-card" aria-label={"圖卡：" + card.title}>
    <span className="question-topic-card-kind">主題圖卡</span>
    <TopicPicture icon={card.icon} />
    <figcaption>{card.title}</figcaption>
    <div className="question-topic-card-slot">請從選項選出對應的文字卡</div>
  </figure>;
}
