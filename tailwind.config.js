import type { Config } from "tailwindcss";

// Every colour is a CSS variable from src/index.css (:root and .dark), read
// as hsl(var(--x) / <alpha-value>) so opacity modifiers (bg-primary/10) work.
const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	// hover: styles apply only where hovering exists, so a tap on the phone
	// never leaves a stuck hover state.
	future: {
		hoverOnlyWhenSupported: true,
	},
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			screens: {
				// From here up the desktop sidebar is full width and PageHeader
				// shows every action; below it the sidebar is a 64px icon rail.
				wide: '1280px'
			},
			fontSize: {
				// Floor app (/m) type scale. Nothing on the floor is smaller
				// than text-floor-meta.
				'floor-title': ['22px', { lineHeight: '28px', fontWeight: '700' }],
				'floor-body': ['16px', { lineHeight: '24px' }],
				'floor-secondary': ['14px', { lineHeight: '20px' }],
				'floor-meta': ['13px', { lineHeight: '18px' }]
			},
			colors: {
				border: token('border'),
				input: token('input'),
				ring: token('ring'),
				background: token('background'),
				foreground: token('foreground'),
				primary: {
					DEFAULT: token('primary'),
					foreground: token('primary-foreground'),
					strong: token('primary-strong'),
					soft: token('primary-soft')
				},
				secondary: {
					DEFAULT: token('secondary'),
					foreground: token('secondary-foreground')
				},
				destructive: {
					DEFAULT: token('destructive'),
					foreground: token('destructive-foreground')
				},
				muted: {
					DEFAULT: token('muted'),
					foreground: token('muted-foreground')
				},
				accent: {
					DEFAULT: token('accent'),
					foreground: token('accent-foreground')
				},
				popover: {
					DEFAULT: token('popover'),
					foreground: token('popover-foreground')
				},
				card: {
					DEFAULT: token('card'),
					foreground: token('card-foreground')
				},
				sidebar: {
					DEFAULT: token('sidebar-background'),
					foreground: token('sidebar-foreground'),
					primary: token('sidebar-primary'),
					'primary-foreground': token('sidebar-primary-foreground'),
					accent: token('sidebar-accent'),
					'accent-foreground': token('sidebar-accent-foreground'),
					border: token('sidebar-border'),
					ring: token('sidebar-ring')
				},
				// Reserved for status: text-status-draft on bg-status-draft-bg.
				status: {
					draft: token('status-draft'),
					'draft-bg': token('status-draft-bg'),
					review: token('status-review'),
					'review-bg': token('status-review-bg'),
					approved: token('status-approved'),
					'approved-bg': token('status-approved-bg'),
					published: token('status-published'),
					'published-bg': token('status-published-bg'),
					archived: token('status-archived'),
					'archived-bg': token('status-archived-bg'),
					retrain: token('status-retrain'),
					'retrain-bg': token('status-retrain-bg')
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			keyframes: {
				'accordion-down': {
					from: { height: '0' },
					to: { height: 'var(--radix-accordion-content-height)' }
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: '0' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
