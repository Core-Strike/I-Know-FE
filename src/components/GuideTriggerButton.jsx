import { IoHelpCircleOutline } from "react-icons/io5";

export default function GuideTriggerButton({ onClick, label = "사용 가이드 열기" }) {
  return (
    <button
      type="button"
      className="guide-trigger-btn"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <IoHelpCircleOutline />
    </button>
  );
}
