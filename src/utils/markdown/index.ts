// Shared markdown conversion utilities

/**
 * Converts HTML content to Markdown
 */
export const htmlToMarkdown = (html: string): string => {
  let markdown = html;
  
  // Convert task lists - needs to happen before regular lists
  markdown = markdown.replace(
    /<ul[^>]*data-type=['"]taskList['"][^>]*>(.*?)<\/ul>/gis,
    (_, listContent) => {
      // Process each task list item
      return listContent.replace(
        /<li[^>]*>(.*?)<\/li>/gis,
        (_liMatch: string, itemContent: string) => {
          // Extract checkbox state
          const checked = itemContent.includes('checked="checked"') || 
                          itemContent.includes('checked="true"') || 
                          itemContent.includes('checked=""');
          
          // Extract the text content
          const textContent = itemContent
            .replace(/<input[^>]*>/gi, '')
            .replace(/<label[^>]*>(.*?)<\/label>/gi, '')
            .replace(/<div[^>]*>(.*?)<\/div>/gi, '$1')
            .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1')
            .replace(/<[^>]+>/g, '');
            
          // Return markdown task item
          const checkboxMark = checked ? '[x]' : '[ ]';
          return `- ${checkboxMark} ${textContent.trim()}\n`;
        }
      );
    }
  );

  // Improved nested lists conversion with DOM parsing
  const convertNestedLists = (htmlContent: string): string => {
    // Create a temporary container to parse HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
    const container = doc.body.firstChild as HTMLElement;
    
    // Function to process a list and its nested lists recursively
    const processList = (list: HTMLElement, indent: number = 0): string => {
      let result = '';
      const isOrdered = list.tagName.toLowerCase() === 'ol';
      let itemCounter = 1;
      
      // Skip task lists as they're handled separately
      if (list.getAttribute('data-type') === 'taskList') {
        return '';
      }
      
      // Process each list item
      Array.from(list.children).forEach((item) => {
        if (item.tagName.toLowerCase() !== 'li') return;
        
        const indentation = '  '.repeat(indent);
        const itemPrefix = isOrdered ? `${itemCounter}. ` : '- ';
        
        // Get text content of the list item, excluding nested lists
        let textContent = '';
        const nestedLists: HTMLElement[] = [];
        
        Array.from(item.childNodes).forEach((child) => {
          const nodeName = child.nodeName.toLowerCase();
          
          if (nodeName === 'ul' || nodeName === 'ol') {
            nestedLists.push(child as HTMLElement);
          } else if (nodeName === '#text') {
            textContent += child.textContent || '';
          } else if (nodeName === 'p' || nodeName === 'div' || nodeName === 'span') {
            // Extract text from paragraphs and divs, but not from nested lists
            let hasNestedList = false;
            Array.from(child.childNodes).forEach((grandchild) => {
              const grandchildName = grandchild.nodeName.toLowerCase();
              if (grandchildName === 'ul' || grandchildName === 'ol') {
                nestedLists.push(grandchild as HTMLElement);
                hasNestedList = true;
              }
            });
            
            if (!hasNestedList) {
              textContent += child.textContent || '';
            } else {
              // If there are nested lists, extract only the direct text content
              Array.from(child.childNodes).forEach((grandchild) => {
                if (grandchild.nodeType === 3) { // Text node
                  textContent += grandchild.textContent || '';
                } else if (grandchild.nodeName.toLowerCase() !== 'ul' && 
                          grandchild.nodeName.toLowerCase() !== 'ol') {
                  textContent += grandchild.textContent || '';
                }
              });
            }
          } else {
            textContent += child.textContent || '';
          }
        });
        
        // Add the list item text
        result += `${indentation}${itemPrefix}${textContent.trim()}\n`;
        
        // Process nested lists
        nestedLists.forEach((nestedList) => {
          result += processList(nestedList, indent + 1);
        });
        
        if (isOrdered) itemCounter++;
      });
      
      return result;
    };
    
    // Find and process all top-level lists
    let output = htmlContent;
    const topLevelLists = container.querySelectorAll(':scope > ul, :scope > ol');
    
    topLevelLists.forEach((list) => {
      const listHtml = list.outerHTML;
      const listMarkdown = processList(list as HTMLElement);
      
      // Replace the list HTML with its markdown equivalent
      output = output.replace(listHtml, listMarkdown);
    });
    
    return output;
  };
  
  // Check if we're running in a browser environment with DOM available
  if (typeof DOMParser !== 'undefined') {
    // Apply the improved nested list conversion
    markdown = convertNestedLists(markdown);
  } else {
    // Fallback for non-browser environments (like Node.js)
    console.warn("DOMParser not available. Using regex-based list conversion instead.");
    
    // Process top-level unordered lists
    markdown = markdown.replace(
      /<ul(?![^>]*data-type=['"]taskList['"])[^>]*>([\s\S]*?)<\/ul>/gi,
      (_, content: string) => {
        return content.replace(
          /<li[^>]*>([\s\S]*?)<\/li>/gi,
          (_: string, itemContent: string) => {
            // Extract text (exclude nested lists)
            const text = itemContent
              .replace(/<ul[\s\S]*?<\/ul>/gi, '')
              .replace(/<ol[\s\S]*?<\/ol>/gi, '')
              .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1')
              .replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '$1')
              .replace(/<[^>]+>/g, '')
              .trim();
            
            // Find and process nested lists with indentation
            const nestedLists = itemContent.match(/<(ul|ol)[^>]*>[\s\S]*?<\/\1>/gi) || [];
            
            let result = `- ${text}\n`;
            
            nestedLists.forEach((nestedList: string) => {
              // Indent nested lists
              const isOrdered = nestedList.startsWith('<ol');
              
              const nestedItems = nestedList.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || [];
              nestedItems.forEach((nestedItem: string, index: number) => {
                const nestedText = nestedItem
                  .replace(/<ul[\s\S]*?<\/ul>/gi, '')
                  .replace(/<ol[\s\S]*?<\/ol>/gi, '')
                  .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1')
                  .replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '$1')
                  .replace(/<[^>]+>/g, '')
                  .trim();
                
                const prefix = isOrdered ? `${index + 1}. ` : '- ';
                result += `  ${prefix}${nestedText}\n`;
              });
            });
            
            return result;
          }
        );
      }
    );
    
    // Process top-level ordered lists
    markdown = markdown.replace(
      /<ol[^>]*>([\s\S]*?)<\/ol>/gi,
      (_, content: string) => {
        let itemIndex = 1;
        return content.replace(
          /<li[^>]*>([\s\S]*?)<\/li>/gi,
          (_: string, itemContent: string) => {
            // Extract text (exclude nested lists)
            const text = itemContent
              .replace(/<ul[\s\S]*?<\/ul>/gi, '')
              .replace(/<ol[\s\S]*?<\/ol>/gi, '')
              .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1')
              .replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '$1')
              .replace(/<[^>]+>/g, '')
              .trim();
            
            // Find and process nested lists with indentation
            const nestedLists = itemContent.match(/<(ul|ol)[^>]*>[\s\S]*?<\/\1>/gi) || [];
            
            let result = `${itemIndex}. ${text}\n`;
            itemIndex++;
            
            nestedLists.forEach((nestedList: string) => {
              // Indent nested lists
              const isOrdered = nestedList.startsWith('<ol');
              
              const nestedItems = nestedList.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || [];
              nestedItems.forEach((nestedItem: string, index: number) => {
                const nestedText = nestedItem
                  .replace(/<ul[\s\S]*?<\/ul>/gi, '')
                  .replace(/<ol[\s\S]*?<\/ol>/gi, '')
                  .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1')
                  .replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '$1')
                  .replace(/<[^>]+>/g, '')
                  .trim();
                
                const prefix = isOrdered ? `${index + 1}. ` : '- ';
                result += `  ${prefix}${nestedText}\n`;
              });
            });
            
            return result;
          }
        );
      }
    );
  }

  // Convert tables
  markdown = markdown.replace(
    /<table[^>]*>(.*?)<\/table>/gis,
    (_, tableContent) => {
      const rows = tableContent.match(/<tr[^>]*>.*?<\/tr>/gis) || [];
      if (rows.length === 0) return "";

      const markdownRows = rows.map((row: string) => {
        const cells = row.match(/<t[dh][^>]*>(.*?)<\/t[dh]>/gi) || [];
        return (
          "| " +
          cells
            .map((cell: string) =>
              cell
                .replace(/<t[dh][^>]*>(.*?)<\/t[dh]>/i, "$1")
                .trim()
            )
            .join(" | ") +
          " |"
        );
      });

      // Add header separator
      if (markdownRows.length > 1) {
        const headerCellCount = (rows[0].match(/<th/gi) || []).length;
        const separator =
          "| " +
          Array(headerCellCount).fill("---").join(" | ") +
          " |";
        markdownRows.splice(1, 0, separator);
      }

      return markdownRows.join("\n");
    }
  );

  // Convert blockquotes
  markdown = markdown.replace(
    /<blockquote[^>]*>\s*<p[^>]*>(.*?)<\/p>\s*<\/blockquote>/gis,
    "> $1\n"
  );

  // Convert headings
  markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n");
  markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n");
  markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n");
  markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n");

  // Convert paragraphs
  markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n");

  // Convert bold and italic
  markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
  markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");
  markdown = markdown.replace(/<u[^>]*>(.*?)<\/u>/gi, "$1"); // Underline has no standard markdown

  // Convert line breaks
  markdown = markdown.replace(/<br[^>]*>/gi, "\n");
  
  // Convert links
  markdown = markdown.replace(/<a href="([^"]+)">(.*?)<\/a>/gi, "[$2]($1)");

  // Decode HTML entities
  const tempElement = document.createElement("textarea");
  tempElement.innerHTML = markdown;
  markdown = tempElement.value;

  return markdown.trim();
};

/**
 * Converts Markdown content to HTML
 */
export const markdownToHtml = (markdown: string): string => {
  let html = markdown;

  // Function to process indented lists recursively
  const processIndentedLists = () => {
    // Regex to match list items with indentation
    const indentedListRegex = /((?:^ {2,}- .*\n?)+)/gm;
    html = html.replace(indentedListRegex, (match) => {
      const lines = match.trimEnd().split('\n');
      let nestedHtml = '<ul>\n';
      lines.forEach(line => {
        // Remove the first level of indentation
        const trimmedLine = line.replace(/^ {2}/, '');
        nestedHtml += `<li>${trimmedLine.substring(2)}</li>\n`;
      });
      nestedHtml += '</ul>';
      return nestedHtml;
    });

    // Regex to match top-level list items
    const listRegex = /((?:^- .*\n?)+)/gm;
    html = html.replace(listRegex, (match) => {
      const lines = match.trimEnd().split('\n');
      let listHtml = '<ul>\n';
      lines.forEach(line => {
        listHtml += `<li>${line.substring(2)}</li>\n`;
      });
      listHtml += '</ul>';
      return listHtml;
    });
  };

  processIndentedLists();


  // Convert task lists
  html = html.replace(/- \[(x| )\] (.*)/g, (match, checked, text) => {
    const isChecked = checked === "x";
    return `<li data-type="taskItem" data-checked="${isChecked}"><label><input type="checkbox" ${
      isChecked ? 'checked="checked"' : ""
    }><span></span></label><div><p>${text}</p></div></li>`;
  });
  html = html.replace(
    /(<li data-type="taskItem".*?<\/li>)+/g,
    (match) => `<ul data-type="taskList">${match}</ul>`
  );

  // Convert headings
  html = html.replace(/^#### (.*$)/gim, "<h4>$1</h4>");
  html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
  html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
  html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");

  // Convert bold and italic
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");

  // Convert links
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');

  // Convert paragraphs
  html = html
    .split("\n")
    .map((line) => {
      if (
        line.trim() === "" ||
        line.startsWith("<h") ||
        line.startsWith("<ul") ||
        line.startsWith("<li")
      ) {
        return line;
      }
      return `<p>${line}</p>`;
    })
    .join("\n");

  return html;
};

/**
 * Converts HTML to plain text
 */
export const htmlToPlainText = (html: string): string => {
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  return tempDiv.textContent || tempDiv.innerText || "";
}; 