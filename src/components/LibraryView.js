import React from "react";
import { Feather, Search, BookOpen, Plus } from "lucide-react";
import styles from "./LibraryView.module.css";

export default function LibraryView({ novels, query, setQuery, onOpen, onCreate, theme, onToggleTheme }) {
  return (
    <div>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <Feather size={22} color="var(--accent)" />
          <h1 className={styles.title}>หิ้งนิยายของฉัน</h1>
        </div>
        <div className={styles.searchBox}>
          <Search size={16} color="var(--text-muted)" />
          <input
            className={styles.searchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อเรื่อง..."
          />
        </div>
      </header>

      <main className={styles.main}>
        {novels.length === 0 ? (
          <div className={styles.emptyState}>
            <Feather size={28} style={{ marginBottom: 10, opacity: 0.5 }} />
            <p className={styles.emptyTitle}>
              {query ? "ไม่พบนิยายที่ตรงกับคำค้นหา" : "หิ้งนิยายยังว่างอยู่"}
            </p>
            <p className={styles.emptySub}>
              {query ? "ลองค้นหาคำอื่น" : "แตะปุ่ม + เพื่อเริ่มเรื่องแรกของคุณ"}
            </p>
          </div>
        ) : (
          <div className={styles.grid}>
            {novels.map((n) => (
              <button
                key={n.id}
                className={styles.novelCard}
                onClick={() => onOpen(n.id)}
              >
                <div
                  className={styles.coverThumb}
                  style={{
                    background: n.cover
                      ? `url(${n.cover}) center/cover no-repeat`
                      : "linear-gradient(135deg, var(--bg-card), var(--bg-secondary))",
                  }}
                >
                  {!n.cover && <BookOpen size={26} color="var(--text-dim)" />}
                </div>
                <div className={styles.novelTitle}>
                  {n.title || "ยังไม่มีชื่อเรื่อง"}
                </div>
                <div className={styles.chapterCount}>
                  <BookOpen size={10} /> {n.chapters ? n.chapters.length : 0} ตอน
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      <button
        className={styles.themeToggle}
        onClick={onToggleTheme}
        aria-label="สลับธีม"
      >
        {theme === "dark" ? "☀️" : "🌙"}
      </button>

      <button
        className={styles.fab}
        onClick={onCreate}
        aria-label="สร้างนิยายเรื่องใหม่"
      >
        <Plus size={24} />
      </button>
    </div>
  );
}
