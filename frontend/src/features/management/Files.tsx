import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Camera,
  ChevronRight,
  Code2,
  Database,
  Download,
  Folder,
  FolderPlus,
  Globe,
  Home,
  Image,
  Laptop,
  Layers,
  List,
  Map,
  Monitor,
  Palette,
  Pencil,
  Shield,
  Search,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Heading } from "./shared";
import { useAuth } from "../auth/Auth";
import { FilePreviewModal } from "../tickets/TicketExtras";
import { storeFileContents, readFileContents, deleteFileContents } from "./fileStorage";
import "./files.css";
type Item = {
  id: string;
  name: string;
  type: "folder" | "file";
  parent: string | null;
  size?: number;
  createdAt: string;
  icon?: string;
  color?: string;
  uploadedBy?: string;
  uploaderId?: string;
};
const seed: Item[] = [
  {
    id: "reports",
    name: "Raporlar",
    type: "folder",
    parent: null,
    createdAt: "",
    icon: "book",
    color: "blue",
  },
  {
    id: "templates",
    name: "Şablonlar",
    type: "folder",
    parent: null,
    createdAt: "",
    icon: "layers",
    color: "purple",
  },
  {
    id: "media",
    name: "Medya",
    type: "folder",
    parent: null,
    createdAt: "",
    icon: "camera",
    color: "pink",
  },
  {
    id: "computer",
    name: "bilgisayar",
    type: "folder",
    parent: null,
    createdAt: "",
    icon: "monitor",
    color: "slate",
  },
];
const iconMap: Record<string, typeof Folder> = {
  book: BookOpen,
  layers: Layers,
  camera: Camera,
  monitor: Monitor,
  folder: Folder,
  code: Code2,
  database: Database,
  globe: Globe,
  home: Home,
  laptop: Laptop,
  map: Map,
  palette: Palette,
  shield: Shield,
  star: Star,
  file: Image,
};
export function FilesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("helpdesk-files") || "null") ?? seed
      );
    } catch {
      return seed;
    }
  });
  const [current, setCurrent] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [list, setList] = useState(false);
  const [preview, setPreview] = useState<{ name: string; mimeType: string; data: Blob } | null>(null);
  const [fileError, setFileError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [newFolder, setNewFolder] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [itemName, setItemName] = useState("");
  const [folderIcon, setFolderIcon] = useState("folder");
  const [folderColor, setFolderColor] = useState("purple");
  const input = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLFormElement>(null);
  const editingItem = items.find((item) => item.id === editingId);
  const canEditName = (item: Item) =>
    user?.role === "ADMIN" ||
    item.type === "folder" ||
    item.uploaderId === user?.id;
  const EditorIcon = iconMap[folderIcon] || Folder;
  useEffect(() => {
    if (newFolder) {
      nameInput.current?.focus({ preventScroll: true });
      editor.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [newFolder, editingId]);
  const closeEditor = () => {
    setNewFolder(false);
    setEditingId(null);
    setItemName("");
    setFolderIcon("folder");
    setFolderColor("purple");
  };
  const edit = (item: Item) => {
    setEditingId(item.id);
    setItemName(item.name);
    setFolderIcon(item.icon || item.type);
    setFolderColor(item.color || "blue");
    setNewFolder(true);
  };
  const save = (next: Item[] | ((previous: Item[]) => Item[])) => {
    setItems(previous => {
      const updated = typeof next === "function" ? next(previous) : next;
      localStorage.setItem("helpdesk-files", JSON.stringify(updated));
      return updated;
    });
  };
  const openFile = async (item: Item, download = false) => {
    setFileError("");
    try {
      const data = await readFileContents(item.id);
      if (!data) {
        setFileError("Bu eski kaydın dosya içeriği saklanmamış. Açmak veya indirmek için dosyayı yeniden yükleyin.");
        return;
      }
      if (download) {
        const url = URL.createObjectURL(data);
        const link = document.createElement("a");
        link.href = url;
        link.download = item.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        setPreview({ name: item.name, mimeType: data.type, data });
      }
    } catch {
      setFileError("Dosya açılamadı. Lütfen tekrar deneyin.");
    }
  };
  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          item.parent === current &&
          item.name
            .toLocaleLowerCase("tr-TR")
            .includes(search.toLocaleLowerCase("tr-TR")),
      ),
    [items, current, search],
  );
  const currentItem = items.find((item) => item.id === current);
  const crumbs = currentItem
    ? [
        { id: null, name: "Ana Dizin" },
        { id: currentItem.id, name: currentItem.name },
      ]
    : [{ id: null, name: "Ana Dizin" }];
  const saveItem = () => {
    const clean = itemName.trim();
    if (!clean) return;
    if (editingId) {
      const existing = items.find((item) => item.id === editingId);
      if (!existing || !canEditName(existing)) {
        closeEditor();
        return;
      }
      save(
        items.map((item) =>
          item.id === editingId
            ? { ...item, name: clean, icon: folderIcon, color: folderColor }
            : item,
        ),
      );
    } else {
      save([
        ...items,
        {
          id: crypto.randomUUID(),
          name: clean,
          type: "folder",
          parent: current,
          createdAt: new Date().toISOString(),
          icon: folderIcon,
          color: folderColor,
        },
      ]);
    }
    closeEditor();
  };
  const remove = (id: string) => {
    const deleted = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      items.forEach((item) => {
        if (item.parent && deleted.has(item.parent) && !deleted.has(item.id)) {
          deleted.add(item.id);
          changed = true;
        }
      });
    }
    save(items.filter((item) => !deleted.has(item.id)));
    void deleteFileContents([...deleted]).catch(() => setFileError("Silinen dosyanın depolanan içeriği temizlenemedi."));
    if (current && deleted.has(current)) setCurrent(null);
    if (editingId && deleted.has(editingId)) closeEditor();
  };
  const upload = async (files: FileList | null) => {
    if (!files) return;
    const selected = Array.from(files);
    const added = selected.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        type: "file" as const,
        parent: current,
        size: file.size,
        createdAt: new Date().toISOString(),
        uploadedBy: user?.name,
        uploaderId: user?.id,
        icon: "file",
        color: "blue",
      }));
    setFileError("");
    setUploading(true);
    try {
      await storeFileContents(added.map((item, index) => ({ id: item.id, data: selected[index] })));
      save(previous => [...previous, ...added]);
    } catch {
      setFileError("Dosyalar kaydedilemedi. Tarayıcı depolama alanını kontrol edip tekrar deneyin.");
    } finally {
      setUploading(false);
    }
  };
  return (
    <main className="page files-page">
      <Heading
        title="Dosya Paylaşımı"
        description={`${items.filter((item) => item.type === "file").length} dosya · ${Math.round(items.filter((item) => item.type === "file").reduce((sum, item) => sum + (item.size || 0), 0) / 1024)} KB kullanılıyor`}
      >
        <div className="files-actions">
          <button
            className="button secondary"
            onClick={() => {
              closeEditor();
              setNewFolder(true);
            }}
          >
            <FolderPlus size={16} />
            Yeni Klasör
          </button>
          <button
            className="button primary"
            disabled={uploading}
            onClick={() => input.current?.click()}
          >
            <Upload size={16} />
            Dosya Yükle
          </button>
          <input
            ref={input}
            hidden
            type="file"
            multiple
            onChange={(event) => {
              void upload(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
      </Heading>
      {fileError && <p className="error" role="alert">{fileError}</p>}
      {preview && <FilePreviewModal file={preview} onClose={() => setPreview(null)} />}
      {newFolder && (
        <form
          ref={editor}
          className="files-folder-form"
          aria-label={editingItem ? "Dosya veya klasör düzenle" : "Yeni klasör"}
          onSubmit={(event) => {
            event.preventDefault();
            saveItem();
          }}
        >
          <EditorIcon size={20} />
          <input
            ref={nameInput}
            autoFocus
            required
            aria-label={
              editingItem?.type === "file" ? "Dosya adı" : "Klasör adı"
            }
            placeholder={
              editingItem?.type === "file" ? "Dosya adı..." : "Klasör adı..."
            }
            value={itemName}
            onChange={(event) => setItemName(event.target.value)}
          />
          <div className="files-picker">
            <span>Simge</span>
            <div>
              {Object.entries(iconMap)
                .filter(
                  ([key]) => key !== "file" || editingItem?.type === "file",
                )
                .map(([key, Icon]) => (
                  <button
                    type="button"
                    className={folderIcon === key ? "selected" : ""}
                    onClick={() => setFolderIcon(key)}
                    key={key}
                    aria-label={`${key} simgesi`}
                    aria-pressed={folderIcon === key}
                  >
                    <Icon size={16} />
                  </button>
                ))}
            </div>
          </div>
          <div className="files-picker">
            <span>Renk</span>
            <div>
              {[
                "orange",
                "blue",
                "green",
                "red",
                "purple",
                "pink",
                "cyan",
                "slate",
              ].map((color) => (
                <button
                  type="button"
                  className={`color-dot ${color}${folderColor === color ? " selected" : ""}`}
                  onClick={() => setFolderColor(color)}
                  key={color}
                  aria-label={`${color} renk`}
                />
              ))}
            </div>
          </div>
          <button type="submit" className="button primary">
            {editingItem ? "Kaydet" : "Oluştur"}
          </button>
          <button
            type="button"
            className="files-icon-button"
            onClick={closeEditor}
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </form>
      )}
      <div className="files-toolbar">
        <div className="files-breadcrumb">
          {crumbs.map((crumb, index) => (
            <span key={String(crumb.id)}>
              <button onClick={() => setCurrent(crumb.id)}>{crumb.name}</button>
              {index < crumbs.length - 1 && <ChevronRight size={15} />}
            </span>
          ))}
        </div>
        <div className="files-tools">
          <label className="files-search">
            <Search size={16} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Dosya ara..."
            />
          </label>
          <button
            className={list ? "" : "active"}
            onClick={() => setList(false)}
            aria-label="Izgara görünümü"
          >
            <Layers size={16} />
          </button>
          <button
            className={list ? "active" : ""}
            onClick={() => setList(true)}
            aria-label="Liste görünümü"
          >
            <List size={16} />
          </button>
        </div>
      </div>
      {!visible.length ? (
        <div className="files-empty">
          <Folder size={42} />
          <strong>Bu klasör boş</strong>
          <span>Dosya yükleyin veya yeni klasör oluşturun</span>
        </div>
      ) : (
        <div className={`files-grid${list ? " list" : ""}`}>
          {visible.map((item) => {
            const Icon = iconMap[item.icon || item.type] || Folder;
            return (
              <div
                className={`file-card ${item.color || "blue"}`}
                key={item.id}
                onClick={() => item.type === "folder" ? setCurrent(item.id) : void openFile(item)}
              >
                <div
                  className="file-card-actions"
                  onClick={(event) => event.stopPropagation()}
                >
                  {item.type === "file" && <button
                    type="button"
                    className="file-card-download"
                    onClick={() => void openFile(item, true)}
                    aria-label={`${item.name} indir`}
                    title="İndir"
                  ><Download size={15} /></button>}
                  {canEditName(item) && (
                    <button
                      type="button"
                      className="file-card-edit"
                      onClick={() => edit(item)}
                      aria-label={`${item.name} düzenle`}
                      title="Düzenle"
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="file-card-delete"
                    onClick={() => remove(item.id)}
                    aria-label={`${item.name} sil`}
                    title="Sil"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <Icon size={34} />
                <div className="file-card-details">
                  <strong>{item.name}</strong>
                  {item.type === "file" && (
                    <small>
                      {Math.max(1, Math.round((item.size || 0) / 1024))} KB
                    </small>
                  )}
                  {item.type === "file" && (
                    <small className="file-card-upload-info">
                      <span>
                        {item.uploadedBy || "Yükleyen bilgisi bulunmuyor"}
                      </span>
                      {item.createdAt && (
                        <time dateTime={item.createdAt}>
                          {new Date(item.createdAt).toLocaleString("tr-TR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Europe/Istanbul",
                          })}
                        </time>
                      )}
                    </small>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
