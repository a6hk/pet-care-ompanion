import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface FormattedAIResponseProps {
  content: string
  isEmergency?: boolean
  className?: string
}

export const FormattedAIResponse: React.FC<FormattedAIResponseProps> = ({
  content,
  isEmergency = false,
  className,
}) => {
  return (
    <div
      className={cn(
        'formatted-ai-response text-xs sm:text-sm leading-relaxed space-y-2',
        isEmergency ? 'text-rose-950' : 'text-gray-800',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1
              className={cn(
                'text-base sm:text-lg font-bold tracking-tight mt-3 mb-2 pb-1 border-b',
                isEmergency
                  ? 'text-rose-700 border-rose-200'
                  : 'text-gray-900 border-gray-200'
              )}
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              className={cn(
                'text-sm sm:text-base font-bold tracking-tight mt-3 mb-1.5',
                isEmergency ? 'text-rose-800' : 'text-indigo-950'
              )}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              className={cn(
                'text-xs sm:text-sm font-bold mt-2.5 mb-1',
                isEmergency ? 'text-rose-900' : 'text-purple-900'
              )}
            >
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="leading-relaxed mb-2 last:mb-0">{children}</p>
          ),
          strong: ({ children }) => (
            <strong
              className={cn(
                'font-semibold',
                isEmergency ? 'text-rose-900' : 'text-gray-950'
              )}
            >
              {children}
            </strong>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-outside pl-4 space-y-1 mb-2.5">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside pl-4 space-y-1 mb-2.5">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed pl-0.5">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote
              className={cn(
                'border-l-4 rounded-r-xl px-3.5 py-2 my-2.5 text-xs sm:text-sm leading-relaxed',
                isEmergency
                  ? 'border-rose-500 bg-rose-100/60 text-rose-950'
                  : 'border-purple-500 bg-purple-50/70 text-purple-950'
              )}
            >
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-xl border border-gray-200 shadow-2xs bg-white">
              <table className="min-w-full divide-y divide-gray-200 text-xs text-left">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-gray-100/90 text-gray-700 font-semibold uppercase text-[10px] tracking-wider">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-gray-100 bg-white">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-gray-50/70 transition-colors">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 font-semibold text-gray-800">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-gray-700 leading-normal">{children}</td>
          ),
          hr: () => (
            <hr
              className={cn(
                'my-3 border-t',
                isEmergency ? 'border-rose-200' : 'border-gray-200'
              )}
            />
          ),
          code: ({ children, className }) => (
            <code
              className={cn(
                'rounded px-1.5 py-0.5 font-mono text-[11px]',
                isEmergency
                  ? 'bg-rose-100 text-rose-800 font-semibold'
                  : 'bg-purple-100/70 text-purple-800 font-semibold',
                className
              )}
            >
              {children}
            </code>
          ),
          a: ({ href, children }) => {
            const isSafe = href && /^(https?:|mailto:)/i.test(href.trim())
            return (
              <a
                href={isSafe ? href : undefined}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'underline font-medium hover:opacity-80 transition-opacity',
                  isEmergency ? 'text-rose-700' : 'text-primary-600'
                )}
              >
                {children}
              </a>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
