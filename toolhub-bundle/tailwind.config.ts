import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Nunito Sans"', 'sans-serif'],
      },
      colors: {
        brand: {
          green: '#ADC837',
          'green-light': '#C6DC65',
          teal: '#02475A',
          cyan: '#029FB5',
          purple: '#522E76',
        },
        dgrey: {
          100: '#404041',
          120: '#303030',
        },
        lgrey: {
          100: '#F4F4F4',
        },
        neutral: {
          300: '#E1E6EF',
        },
      },
    },
  },
  plugins: [],
}

export default config
