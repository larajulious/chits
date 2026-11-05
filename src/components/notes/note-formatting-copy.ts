import { tr } from '@/localization/runtime';

// Feature copy uses i18next defaults until these keys receive reviewed catalog
// translations. Existing locale catalogs and user-selected language stay intact.
const ENGLISH: Record<string, string> = {
  "titleLabel": "Note title",
  "titlePlaceholder": "Add a title (optional)",
  "open": "Text formatting",
  "close": "Close text formatting",
  "heading": "Make it yours",
  "done": "Done",
  "normal": "Normal text",
  "heading1": "Heading 1",
  "heading2": "Heading 2",
  "bold": "Bold",
  "italic": "Italic",
  "underline": "Underline",
  "text": "Text",
  "highlight": "Highlight",
  "textColor": "Text color: {{color}}",
  "highlightColor": "Highlight: {{color}}",
  "bullet": "Bullet list",
  "numbered": "Numbered list",
  "checklist": "Checkbox list",
  "colors.default": "Default",
  "colors.gray": "Gray",
  "colors.white": "White",
  "colors.red": "Red",
  "colors.orange": "Orange",
  "colors.yellow": "Yellow",
  "colors.green": "Green",
  "colors.cyan": "Cyan",
  "colors.blue": "Blue",
  "colors.purple": "Purple",
  "colors.rose": "Rose",
  "colors.none": "None",
  "colors.pink": "Pink"
};

export function formattingText(key: string, values?: Record<string, unknown>) {
  return tr(`noteformatting.${key}`, { defaultValue: ENGLISH[key], ...values });
}
