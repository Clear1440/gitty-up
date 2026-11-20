import { CopyOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import clsx from 'clsx';
import { useRef, useState } from 'react';
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

const tabId = (client) => `mcp-client-${client.id}`;
const PANEL_ID = 'mcp-client-snippet';

/**
 * What to add to each AI tool's config to connect it: the apps listed on the left, and
 * the chosen one's snippet beside them. Up and down arrows move through the list too.
 */
export function McpSnippets({ url }) {
  const [index, setIndex] = useState(initialIndex);
  const tabRefs = useRef([]);
  const copy = useCopyToClipboard();
  const client = MCP_CLIENTS[index];
  const snippet = client.snippet(url);

  const show = (nextIndex) => {
    setIndex(nextIndex);
    StorageHelper.write(STORAGE_KEY, MCP_CLIENTS[nextIndex].id);
  };

  const handleKeyDown = (event) => {
    const moves = { ArrowUp: -1, ArrowDown: 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const nextIndex = stepClient(index, moves[event.key]);
    show(nextIndex);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className={styles.layout}>
      <div
        className={styles.list}
        role="tablist"
        aria-orientation="vertical"
        aria-label="AI tools"
        onKeyDown={handleKeyDown}
      >
        {MCP_CLIENTS.map((option, optionIndex) => {
          const isSelected = optionIndex === index;
          return (
            <button
              key={option.id}
              ref={(element) => {
                tabRefs.current[optionIndex] = element;
              }}
              id={tabId(option)}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={PANEL_ID}
              // Only the chosen app is a tab stop. The arrows reach the rest.
              tabIndex={isSelected ? 0 : -1}
              className={clsx(styles.item, isSelected && styles.selected)}
              onClick={() => show(optionIndex)}
            >
              {option.name}
            </button>
          );
        })}
      </div>
      <div className={styles.panel} id={PANEL_ID} role="tabpanel" aria-labelledby={tabId(client)}>
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
      </div>
    </div>
  );
}
