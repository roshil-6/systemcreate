import re

with open('client/src/pages/Leads.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Add useMemo import if missing
if 'useMemo' not in content:
    content = re.sub(r"import React, \{([^}]+)\} from 'react';", r"import React, {\1, useMemo} from 'react';", content)

# Look for the start of the table body mapping
start_str = '{leads.map((lead, index) => ('
end_str = '              ))}'

if start_str in content and end_str in content:
    idx_start = content.find(start_str)
    # The end_str might match multiple times, find the first one after start_str
    idx_end = content.find(end_str, idx_start) + len(end_str)
    
    # Extract the map block
    map_block = content[idx_start:idx_end]
    
    # We want to replace it with a useMemo block just above the return in Leads.js?
    # No, we can define useMemo right in the render if we want? NO! Hooks must be at top level.
    # It's better to find the start of the render return and put it there.
