import re
import sys

filename = sys.argv[1]

with open(filename, 'r', encoding='utf-8') as f:
    content = f.read()

# Add toast import
if "import toast from 'react-hot-toast';" not in content:
    content = re.sub(r"import React, \{([^}]+)\} from 'react';", r"import React, {\1} from 'react';\nimport toast from 'react-hot-toast';", content)
    # Also handle import React from 'react';
    if "import toast from 'react-hot-toast';" not in content:
        content = re.sub(r"import React from 'react';", r"import React from 'react';\nimport toast from 'react-hot-toast';", content)

# Function to replace alert with toast.error or toast.success
def replacer(match):
    arg = match.group(1)
    if 'error' in arg.lower() or 'failed' in arg.lower() or 'please' in arg.lower() or 'errormessage' in arg.lower():
        return f'toast.error({arg});'
    else:
        return f'toast.success({arg});'

content = re.sub(r'alert\((.*?)\);', replacer, content)

with open(filename, 'w', encoding='utf-8') as f:
    f.write(content)
