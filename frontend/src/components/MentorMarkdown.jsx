import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders Sarah's chat replies as Markdown (bold, lists, tables, headings)
 * inside a chat bubble without breaking layout on narrow screens — tables
 * scroll horizontally in their own container instead of overflowing the page.
 */
export default function MentorMarkdown({ content, className = '' }) {
    if (!content) return null;

    return (
        <div className={`mentor-markdown text-sm leading-relaxed break-words ${className}`}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                    strong: ({ node, ...props }) => <strong className="font-semibold" {...props} />,
                    em: ({ node, ...props }) => <em className="italic" {...props} />,
                    ul: ({ node, ...props }) => <ul className="mb-2 ml-4 list-disc space-y-1 last:mb-0" {...props} />,
                    ol: ({ node, ...props }) => <ol className="mb-2 ml-4 list-decimal space-y-1 last:mb-0" {...props} />,
                    li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
                    h1: ({ node, ...props }) => <h3 className="mb-1.5 mt-2 text-base font-semibold first:mt-0" {...props} />,
                    h2: ({ node, ...props }) => <h3 className="mb-1.5 mt-2 text-base font-semibold first:mt-0" {...props} />,
                    h3: ({ node, ...props }) => <h4 className="mb-1 mt-2 text-sm font-semibold first:mt-0" {...props} />,
                    hr: () => <hr className="my-3 border-current opacity-15" />,
                    a: ({ node, ...props }) => (
                        <a className="underline underline-offset-2 hover:opacity-80" target="_blank" rel="noopener noreferrer" {...props} />
                    ),
                    code: ({ node, inline, ...props }) =>
                        inline ? (
                            <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/10" {...props} />
                        ) : (
                            <code className="block whitespace-pre-wrap font-mono text-[0.85em]" {...props} />
                        ),
                    pre: ({ node, ...props }) => (
                        <pre className="mb-2 overflow-x-auto rounded-lg bg-black/10 p-2.5 last:mb-0 dark:bg-white/10" {...props} />
                    ),
                    blockquote: ({ node, ...props }) => (
                        <blockquote className="mb-2 border-l-2 border-current/30 pl-3 opacity-90 last:mb-0" {...props} />
                    ),
                    table: ({ node, ...props }) => (
                        <div className="mb-2 max-w-full overflow-x-auto rounded-lg border border-current/15 last:mb-0">
                            <table className="w-full min-w-[420px] border-collapse text-left text-[0.85em]" {...props} />
                        </div>
                    ),
                    thead: ({ node, ...props }) => <thead className="bg-black/5 dark:bg-white/10" {...props} />,
                    th: ({ node, ...props }) => (
                        <th className="border-b border-current/15 px-2.5 py-1.5 font-semibold" {...props} />
                    ),
                    td: ({ node, ...props }) => (
                        <td className="border-b border-current/10 px-2.5 py-1.5 align-top" {...props} />
                    ),
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
