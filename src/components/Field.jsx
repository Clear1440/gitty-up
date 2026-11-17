import styles from './Field.module.css';

/**
 * A form control under a label that stays on show, unlike a placeholder, which goes
 * once something is typed. `hint` is a line of help under the control.
 */
export function Field({ label, hint, children }) {
  return (
    <div className={styles.field}>
      {/* A label element forwards clicks, which would open a Select as it closes. */}
      <span className={styles.label}>{label}</span>
      {children}
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}

/** A line in a dialog that says what pressing its button will do. */
export function Outcome({ children }) {
  return <p className={styles.outcome}>{children}</p>;
}
