import { useEffect } from "react";
import { IoClose } from "react-icons/io5";

export default function GuideModal({ open, title, imageSrc, imageAlt, onClose }) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="guide-modal-backdrop" onClick={onClose}>
      <div className="guide-modal" onClick={(event) => event.stopPropagation()}>
        <div className="guide-modal-header">
          <div>
            <h3>{title}</h3>
            <p>이미지를 아래로 스크롤하며 사용 방법을 확인할 수 있습니다.</p>
          </div>
          <button
            type="button"
            className="guide-modal-close"
            onClick={onClose}
            aria-label="도움말 닫기"
          >
            <IoClose />
          </button>
        </div>
        <div className="guide-modal-body">
          <img src={imageSrc} alt={imageAlt} className="guide-modal-image" />
        </div>
      </div>
    </div>
  );
}
