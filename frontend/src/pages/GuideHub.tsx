import { BookOpen, FolderOpen } from "lucide-react";
import { Navigate, NavLink, useParams } from "react-router-dom";
import { useAuth } from "../features/auth/Auth";
import { ProjectGuidePage } from "../features/management/ProjectGuide";
import { workspacePath } from "../router/paths";
import { GuidePage } from "./Guide";

export function GuideHubPage() {
  const { user } = useAuth();
  const { section } = useParams();
  if (!user) return null;
  const active = section === "system" ? "system" : "projects";
  if (section !== active)
    return (
      <Navigate to={workspacePath(user.role, `guide/${active}`)} replace />
    );
  return (
    <div className="guide-hub">
      <header className="guide-hub-header">
        <div>
          <span className="eyebrow">DESTEK MERKEZİ</span>
          <h1>Rehber</h1>
          <p>
            Proje bilgilerine ve sistem kullanım adımlarına tek yerden ulaşın.
          </p>
        </div>
        <nav className="guide-hub-tabs" aria-label="Rehber bölümleri">
          <NavLink
            to={workspacePath(user.role, "guide/projects")}
            aria-current={active === "projects" ? "page" : undefined}
          >
            <FolderOpen size={17} />
            Proje Rehberi
          </NavLink>
          <NavLink
            to={workspacePath(user.role, "guide/system")}
            aria-current={active === "system" ? "page" : undefined}
          >
            <BookOpen size={17} />
            Sistem Rehberi
          </NavLink>
        </nav>
      </header>
      <div
        className="guide-hub-content"
        role="region"
        aria-label={active === "projects" ? "Proje Rehberi" : "Sistem Rehberi"}
      >
        {active === "projects" ? <ProjectGuidePage /> : <GuidePage />}
      </div>
    </div>
  );
}
