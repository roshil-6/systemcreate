import re

with open('client/src/pages/Leads.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add refs for search
content = re.sub(
    r"const \[searchInput, setSearchInput\] = useState\(searchParams.get\('search'\) \|\| ''\);",
    "const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');\n  const searchInputRef = useRef(searchParams.get('search') || '');",
    content
)

content = re.sub(
    r"const \[phoneSearchInput, setPhoneSearchInput\] = useState\(searchParams.get\('phone'\) \|\| ''\);",
    "const [phoneSearchInput, setPhoneSearchInput] = useState(searchParams.get('phone') || '');\n  const phoneSearchInputRef = useRef(searchParams.get('phone') || '');",
    content
)

# 2. Update handleSearchInputChange to update refs instead of state
content = re.sub(
    r"const handleSearchInputChange = \(e\) => \{\s*setSearchInput\(e\.target\.value\);\s*\};",
    "const handleSearchInputChange = (e) => { searchInputRef.current = e.target.value; };",
    content
)

content = re.sub(
    r"const handlePhoneSearchInputChange = \(e\) => \{\s*setPhoneSearchInput\(e\.target\.value\);\s*\};",
    "const handlePhoneSearchInputChange = (e) => { phoneSearchInputRef.current = e.target.value; };",
    content
)

# 3. Update handleSearch to use refs
content = re.sub(
    r"setSearch\(searchInput\.trim\(\)\);",
    "setSearch(searchInputRef.current.trim());",
    content
)
content = re.sub(
    r"setPhoneSearch\(phoneSearchInput\.trim\(\)\);",
    "setPhoneSearch(phoneSearchInputRef.current.trim());",
    content
)

# 4. Change inputs to use defaultValue instead of value
content = re.sub(
    r"value=\{searchInput\}\s+onChange=\{handleSearchInputChange\}",
    r"defaultValue={searchInputRef.current} onChange={handleSearchInputChange}",
    content
)

content = re.sub(
    r"value=\{phoneSearchInput\}\s+onChange=\{handlePhoneSearchInputChange\}",
    r"defaultValue={phoneSearchInputRef.current} onChange={handlePhoneSearchInputChange}",
    content
)

with open('client/src/pages/Leads.js', 'w', encoding='utf-8') as f:
    f.write(content)
