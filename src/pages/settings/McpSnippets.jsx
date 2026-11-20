import { CopyOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import clsx from 'clsx';
import { useState } from 'react';
import { StorageHelper } from '../../utils/StorageHelper.js';
import { useCopyToClipboard } from '../../utils/useCopyToClipboard.js';
import { MCP_CLIENTS, stepClient } from './mcpClients.js';
import styles from './McpSnippets.module.css';

/** The app last shown, so coming back to the settings finds the same one. */
const STORAGE_KEY = 'gitty-up.mcp-client';

function initialIndex() {
  const index = MCP_CLIENTS.findIndex((client) => client.id === StorageHelper.read(STORAGE_KEY, null));
  return Math.max(index, 0);
}

/**
 * What to add to each AI tool's config to connect it, one app at a time. The arrows,
 * the dots or the left and right arrow keys go from one app to the next.
 */
export function McpSnippets({ url }) {
  const [index, setIndex] = useState(initialIndex);
  const copy = useCopyToClipboard();
  const client = MCP_CLIENTS[index];
  const snippet = client.snippet(url);

  const show = (nextIndex) => {
    setIndex(nextIndex);
    StorageHelper.write(STORAGE_KEY, MCP_CLIENTS[nextIndex].id);
  };
  const step = (by) => show(stepClient(index, by));

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowLeft') step(-1);
    else if (event.key === 'ArrowRight') step(1);
    else return;
    event.preventDefault();
  };

  return (
    <div
      className={styles.carousel}
      role="group"
      aria-roledescription="carousel"
      aria-label="Config for each AI tool"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.header}>
        <Button
          type="text"
          icon={<LeftOutlined />}
          aria-label="Previous app"
          onClick={() => step(-1)}
        />
        <div className={styles.title} aria-live="polite">
          <span className={styles.name}>{client.name}</span>
          <span className={styles.count}>
            {index + 1} of {MCP_CLIENTS.length}
          </span>
        </div>
        <Button
          type="text"
          icon={<RightOutlined />}
          aria-label="Next app"
          onClick={() => step(1)}
        />
      </div>
      <p className={styles.where}>{client.where}</p>
      <div className={styles.codeBox}>
        <pre className={styles.code} data-language={client.language}>
          {snippet}
        </pre>
        <Button
          className={styles.copy}
          size="small"
          icon={<CopyOutlined />}
          onClick={() => copy(snippet, `the ${client.name} config`)}
        >
          Copy
        </Button>
      </div>
      {client.note && <p className={styles.note}>{client.note(url)}</p>}
      <div className={styles.dots}>
        {MCP_CLIENTS.map((option, optionIndex) => (
          <button
            key={option.id}
            type="button"
            tabIndex={-1}
            className={clsx(styles.dot, optionIndex === index && styles.activeDot)}
            aria-label={`Show ${option.name}`}
            aria-current={optionIndex === index}
            title={option.name}
            onClick={() => show(optionIndex)}
          />
        ))}
      </div>
    </div>
  );
}
