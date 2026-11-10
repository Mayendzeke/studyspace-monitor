import { Smile } from "lucide-react";

const EMOJIS = [
  "😀","😃","😄","😁","😅","😂","🤣","😊","🙂","😉","😍","🥰",
  "😎","🤩","🥳","😇","🤗","🤔","🤓","😴","🙏","👏","👍","👎",
  "❤️","💙","💚","💛","💜","🔥","⭐","✨","🎉","💯","✅","📚",
  "✏️","🧠","🎯","🏆","🌟","☀️","🌱","💪","🙌","🤝","👀","💡"
];

export default function EmojiPicker({ onSelect, label = "Choose an emoji" }: {
  onSelect: (emoji: string) => void;
  label?: string;
}) {
  return <div className="ss-emoji-picker" role="group" aria-label={label}>
    <div className="ss-emoji-picker-title"><Smile size={14}/> Add an emoji</div>
    <div className="ss-emoji-picker-grid">
      {EMOJIS.map(emoji => <button key={emoji} type="button" onClick={() => onSelect(emoji)} aria-label={emoji}>{emoji}</button>)}
    </div>
  </div>;
}
