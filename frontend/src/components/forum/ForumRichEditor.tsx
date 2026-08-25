'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bold, Italic, Link2, List, ListOrdered, Smile, Underline } from 'lucide-react';
import { ChatApi } from '@/lib/chatApi';
import { FORUM_EMOJI_CHOICES } from '@/lib/forumPresentation';

type MentionUser = { id: string; name: string; role_name: string };

function currentMention(text: string) {
  const match = text.match(/(^|\s)@([A-Za-z][A-Za-z0-9 .'-]{0,40})$/);
  return match?.[2] || '';
}

export default function ForumRichEditor({
  value,
  onChange,
  placeholder = 'Write a message...',
  minHeight = 140,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [people, setPeople] = useState<MentionUser[]>([]);

  useEffect(() => {
    void ChatApi.employees().then((rows) =>
      setPeople(rows.map((item) => ({ id: item.id, name: item.name, role_name: item.role_name })))
    );
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.innerHTML !== value) el.innerHTML = value || '';
  }, [value]);

  const matches = useMemo(() => {
    const needle = mentionQuery.trim().toLowerCase();
    if (!needle) return [];
    return people.filter((item) => item.name.toLowerCase().includes(needle)).slice(0, 6);
  }, [mentionQuery, people]);

  const run = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    onChange(ref.current?.innerHTML || '');
  };

  const insertText = (text: string) => {
    ref.current?.focus();
    document.execCommand('insertText', false, text);
    onChange(ref.current?.innerHTML || '');
  };

  const insertMention = (name: string) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const node = range.startContainer;
      if (node.nodeType === Node.TEXT_NODE && node.textContent) {
        const text = node.textContent.slice(0, range.startOffset);
        const cut = text.lastIndexOf('@');
        if (cut >= 0) {
          node.textContent = `${node.textContent.slice(0, cut)}@${name} ${node.textContent.slice(range.startOffset)}`;
          const next = document.createRange();
          next.setStart(node, cut + name.length + 2);
          next.collapse(true);
          selection.removeAllRanges();
          selection.addRange(next);
        }
      } else {
        document.execCommand('insertText', false, `@${name} `);
      }
    } else {
      document.execCommand('insertText', false, `@${name} `);
    }
    setMentionQuery('');
    onChange(el.innerHTML);
  };

  const addLink = () => {
    const url = window.prompt('Link URL');
    if (!url?.trim()) return;
    run('createLink', url.trim());
  };

  return (
    <div className="rounded-md border border-slate-800 bg-slate-950">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 px-2 py-1.5">
        <button type="button" onClick={() => run('bold')} className="rounded p-1.5 text-slate-300 hover:bg-slate-800" aria-label="Bold">
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => run('italic')} className="rounded p-1.5 text-slate-300 hover:bg-slate-800" aria-label="Italic">
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => run('underline')} className="rounded p-1.5 text-slate-300 hover:bg-slate-800" aria-label="Underline">
          <Underline className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => run('insertUnorderedList')} className="rounded p-1.5 text-slate-300 hover:bg-slate-800" aria-label="Bullet list">
          <List className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => run('insertOrderedList')} className="rounded p-1.5 text-slate-300 hover:bg-slate-800" aria-label="Numbered list">
          <ListOrdered className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={addLink} className="rounded p-1.5 text-slate-300 hover:bg-slate-800" aria-label="Link">
          <Link2 className="h-3.5 w-3.5" />
        </button>
        <div className="relative">
          <button type="button" onClick={() => setEmojiOpen((open) => !open)} className="rounded p-1.5 text-slate-300 hover:bg-slate-800" aria-label="Emoji">
            <Smile className="h-3.5 w-3.5" />
          </button>
          {emojiOpen && (
            <div className="absolute left-0 z-20 mt-1 grid w-44 grid-cols-6 gap-1 rounded-lg border border-slate-800 bg-slate-900 p-2 shadow-xl">
              {FORUM_EMOJI_CHOICES.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    insertText(emoji);
                    setEmojiOpen(false);
                  }}
                  className="rounded p-1 text-sm hover:bg-slate-800"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="relative">
        {!value && <div className="pointer-events-none absolute left-3 top-2 text-xs text-slate-500">{placeholder}</div>}
        <div
          ref={ref}
          contentEditable
          role="textbox"
          aria-multiline="true"
          className="forum-body max-h-64 overflow-y-auto px-3 py-2 text-xs text-slate-100 outline-none [&_a]:text-cyan-400 [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
          style={{ minHeight }}
          onInput={() => {
            const html = ref.current?.innerHTML || '';
            onChange(html);
            const text = ref.current?.innerText || '';
            setMentionQuery(currentMention(text));
          }}
        />
        {matches.length > 0 && (
          <div className="absolute bottom-2 left-2 right-2 z-20 rounded-md border border-slate-800 bg-slate-900 py-1 shadow-xl">
            {matches.map((person) => (
              <button
                key={person.id}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertMention(person.name);
                }}
                className="block w-full px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800"
              >
                <span className="font-semibold">@{person.name}</span>
                <span className="ml-2 text-[10px] text-slate-500">{person.role_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
