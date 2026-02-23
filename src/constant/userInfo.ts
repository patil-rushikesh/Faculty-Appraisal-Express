export const ROLE = [
	{ label: 'Associate Dean', value: 'associate_dean' },
	{ label: 'Director', value: 'director' },
	{ label: 'HOD', value: 'hod' },
	{ label: 'Dean', value: 'dean' },
	{ label: 'Admin', value: 'admin' },
	{ label: 'Faculty', value: 'faculty' },
] as const;

export const DESIGNATION = [
	{ label: 'Professor', value: 'Professor' },
	{ label: 'Associate Professor', value: 'Associate Professor' },
	{ label: 'Assistant Professor', value: 'Assistant Professor' },
]

export type UserRole = typeof ROLE[number]["value"];
export type UserDesignation = typeof DESIGNATION[number]["value"];