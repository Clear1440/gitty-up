import { Button, Modal } from 'antd';
import { Fragment } from 'react';
import { parseInline } from './changelog.js';
import styles from './ChangelogDialog.module.css';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });

function formatDate(date) {
  const parsed = Date.parse(date);
  return Number.isNaN(parsed) ? date : dateFormat.format(parsed);
}

function Inline({ text }) {
  return parseInline(text).map((part, index) => {
    switch (part.type) {
      case 'bold':
        return <strong key={index}>{part.text}</strong>;
      case 'code':
        return (
          <code key={index} className={styles.code}>
            {part.text}
          </code>
        );
      case 'link':
        return (
          <a key={index} href={part.href} target="_blank" rel="noreferrer">
            {part.text}
          </a>
        );
      default:
        return <Fragment key={index}>{part.text}</Fragment>;
    }
  });
}

function Release({ release, current }) {
  const { version, date, notes, sections } = release;
  return (
    <section className={styles.release}>
      <header className={styles.releaseHeader}>
        <h3 className={styles.version}>{version ? `v${version}` : 'Unreleased'}</h3>
        {version === current && <span className={styles.badge}>You have this</span>}
        <span className={styles.date}>{date ? formatDate(date) : !version && 'Not in a release yet'}</span>
      </header>
      {notes.map((note) => (
        <p key={note} className={styles.note}>
          <Inline text={note} />
        </p>
      ))}
      {sections.map(
        ({ title, items }, index) =>
          items.length > 0 && (
            <div key={title ?? index} className={styles.section}>
              {title && <h4 className={styles.sectionTitle}>{title}</h4>}
              <ul className={styles.items}>
                {items.map((item) => (
                  <li key={item}>
                    <Inline text={item} />
                  </li>
                ))}
              </ul>
            </div>
          ),
      )}
    </section>
  );
}

/** The changelog, or the part of it given in `releases`, in a scrolling dialog. */
export function ChangelogDialog({ open, title = "What's new", releases, current, onClose }) {
  return (
    <Modal
      open={open}
      title={title}
      onCancel={onClose}
      width={620}
      footer={
        <Button type="primary" onClick={onClose}>
          Done
        </Button>
      }
      className={styles.dialog}
    >
      <div className={styles.body}>
        {releases.length > 0 ? (
          releases.map((release) => (
            <Release key={release.version ?? 'unreleased'} release={release} current={current} />
          ))
        ) : (
          <p className={styles.note}>Nothing has been written down yet.</p>
        )}
      </div>
    </Modal>
  );
}
