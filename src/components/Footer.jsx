import { FaGithub } from "react-icons/fa";

function Footer() {
  const members = [
    {
      name: "정은아",
      email: "eunah0507@naver.com",
      github: "https://github.com/eunah0507",
    },
    {
      name: "오의석",
      email: "dkdlelxoa@naver.com",
      github: "https://github.com/ohuiseok",
    },
    {
      name: "김보민",
      email: "riahboa@naver.com",
      github: "https://github.com/WHOOZ-23",
    },
  ];

  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <p className="app-footer-title">
          2026 KIT 바이브코딩 공모전 출품작 · AI 분석 이해도 저하 자동 감지 알림
          서비스
        </p>
        <div className="app-footer-members">
          {members.map((member) => (
            <div key={member.email} className="app-footer-member">
              <span className="app-footer-name">{member.name}</span>
              <a href={`mailto:${member.email}`} className="app-footer-email">
                {member.email}
              </a>
              <a
                href={member.github}
                target="_blank"
                rel="noreferrer"
                aria-label={`${member.name} GitHub`}
                className="app-footer-github"
                title={`${member.name} GitHub`}
              >
                <FaGithub />
              </a>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}

export default Footer;
