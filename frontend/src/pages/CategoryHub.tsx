import { Award, Tags } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../features/auth/Auth";
import { hasPermission } from "../features/auth/permissions";
import { TagsPage } from "../features/management/Catalog";
import { SkillsPage } from "../features/management/Skills";
import { workspacePath } from "../router/paths";

export function CategoryHubPage({ section = "categories" }: { section?: "categories" | "skills" }) {
  const { user } = useAuth();
  if (!user) return null;
  const active = section === "skills" ? "skills" : "categories";
  return (
    <div className="guide-hub category-hub">
      <header className="guide-hub-header">
        <div>
          <h1>Kategoriler</h1>
          <p>Görüşme kategorilerini ve personel yeteneklerini tek yerden yönetin.</p>
        </div>
        <nav className="guide-hub-tabs" aria-label="Kategori Bölümleri">
          {hasPermission(user, "tags.view") && (
            <NavLink to={workspacePath(user.role, "tags")} end>
              <Tags size={17} />
              Görüşme Kategorileri
            </NavLink>
          )}
          {hasPermission(user, "skills.view") && (
            <NavLink to={workspacePath(user.role, "tags/skills")}>
              <Award size={17} />
              Yetenekler
            </NavLink>
          )}
        </nav>
      </header>
      <div className="guide-hub-content" role="region" aria-label={active === "skills" ? "Yetenekler" : "Görüşme Kategorileri"}>
        {active === "skills" ? <SkillsPage /> : <TagsPage />}
      </div>
    </div>
  );
}
