import styles from './Logo.module.css';

export function Logo() {
  return (
    <span className={styles.logo}>
      <img src="/favicon.svg" alt="" width={24} height={24} />
      <span className={styles.name}>gity-up</span>
    </span>
  );
}
