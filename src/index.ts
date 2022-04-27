// JupyterLab extension parts
import {
	JupyterFrontEnd,
	JupyterFrontEndPlugin
} from '@jupyterlab/application';

// Allow for settings to be loaded and saved
import { ISettingRegistry } from '@jupyterlab/settingregistry';

// Toolbar button class
import { ToolbarButton } from '@jupyterlab/apputils';

// Register with the Document registry to allow creation of widgets
// https://jupyterlab.readthedocs.io/en/stable/extension/documents.html#document-registry
import { DocumentRegistry } from '@jupyterlab/docregistry';

// Allows widgets to be destroyed
import { IDisposable, DisposableDelegate } from '@lumino/disposable';

// Notebook actions
import {
	// NotebookActions,
	NotebookPanel,
	INotebookModel,
	INotebookTools,
} from '@jupyterlab/notebook';

import {
	ICodeMirror,
	CodeMirrorEditor,
} from '@jupyterlab/codemirror';

import {
	TextMarker
} from 'codemirror';

import _ from 'lodash';

interface GrammarResponse{
	offset: number;
	errorLength: number;
	message: string;
}

var enabled = true;

/**
 * A notebook widget extension that adds a button to the toolbar.
 */
export class ButtonExtension implements DocumentRegistry.IWidgetExtension<NotebookPanel, INotebookModel> {
	/**
	 * Create a new extension for the notebook panel widget.
	 *
	 * @param panel Notebook panel
	 * @param context Notebook context
	 * @returns Disposable on the added button
	 */
	createNew(
		panel: NotebookPanel,
		context: DocumentRegistry.IContext<INotebookModel>
	): IDisposable {
		const toggleChecker = () => {
			enabled = !enabled;
		};

		const bToggle = new ToolbarButton({
			className: 'grammar-check-button',
			label: 'Toggle',
			onClick: toggleChecker,
			tooltip: 'Toggles the grammar checker',
		});

		panel.toolbar.insertItem(10, 'toggleGrammar', bToggle);
		return new DisposableDelegate(() => {
			bToggle.dispose();
		});
	}
}

function clearErrorMarks(errorMarks: TextMarker[]) {
	errorMarks.forEach((mark: TextMarker) => {
		console.log('clear!');
		mark.clear();
	});
}

// Create a POST request on the text inside the markdown cell
function checkGrammar(editor: CodeMirrorEditor, errorMarks: TextMarker[]) {
	if (!enabled) {
		console.log("Grammar checker is disabled.");
		return;
	}

	fetch('http://localhost:5000/check', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ markdown: editor.model.value.text })
	}).then((reply: Response) => { // todo find these types
		reply.json().then((data: GrammarResponse[]) => {
			data.forEach((error: GrammarResponse) => {
				// console.log(error);
				
				// Find where the error is
				var start = editor.doc.posFromIndex(error.offset); // get objs with `line` and `ch` (column) info that markText needs
				var end = editor.doc.posFromIndex(error.offset + error.errorLength);

				// Determine the class (for styling) to add to the error message
				var errorType = error.message.search('spelling') == -1 ? 'grammar-error' : 'spelling-error';
				// Apply the error style to the text
				errorMarks.push(editor.doc.markText(start, end, {
					attributes: { 'data-text': '(' + error.message + ')' },
					className: 'error-tooltip ' + errorType
				}));
			})
		})
	});

}

/**
 * Initialization data for the grammar_checker extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
	id: 'grammar_checker:plugin',
	autoStart: true,
	requires: [INotebookTools, ICodeMirror],
	optional: [ISettingRegistry],
	activate: (app: JupyterFrontEnd, notebook: INotebookTools, cm: ICodeMirror, settingRegistry: ISettingRegistry | null) => {
		console.log('JupyterLab extension grammar_checker is activated!');

		if (settingRegistry) {
			settingRegistry
				.load(plugin.id)
				.then(settings => {
					console.log('grammar_checker settings loaded:', settings.composite);
				})
				.catch(reason => {
					console.error('Failed to load settings for grammar_checker.', reason);
				});
		}

		// Set panel to the current active panel
		// var panel = notebook.activeNotebookPanel;
		var errorMarks: TextMarker[] = [];

		// setTimeout cannot take args, so checkCells cannot have any arguments - use closure to access panel
		function checkActiveCell() {
			const REFRESH_MS = 1000;

			// Cell to check. If possible, get Cell[]
			var cell /* Cell */ = notebook.activeCell;
			
			// If no active cell, reschedule and return
			if (!cell || cell.model.type !== 'markdown') {
				console.log(`Skipping active cell (type ${cell?.model.type}).`);
				setTimeout(checkActiveCell, REFRESH_MS);
				return;
			}
			
			// Need to cast to get full access to the codemirror methods
			// https://stackoverflow.com/questions/67626233/how-can-i-get-a-reference-to-a-codemirror-instance-in-jupyterlab
			var editor = cell.editor as CodeMirrorEditor;
			
			clearErrorMarks(errorMarks);
			errorMarks = []; // Reset here b/c we want to capture the errorMarks from the previous scope
			
			// Check grammar for the current cell
			console.log("Checking active cell.");
			checkGrammar(editor, errorMarks);

			// Set a throttled version of the checker to run whenever the cell is changed
			// Not really applicable if using only active cell
			//! Uses global `errorMarks`, so if we set this to many cells it will get messed up
			// Used in reference implementation to attach a checker to each cell
			// editor.doc.on("change", _.throttle(
			// 	ed => checkGrammar(ed, errorMarks), 300,
			// 	{ leading: false, trailing: true }
			// ));

			// Set timeout
			setTimeout(checkActiveCell, REFRESH_MS);
		}

		// Start process of checking cells
		checkActiveCell();

		// Add button to the toolbar
		app.docRegistry.addWidgetExtension('Notebook', new ButtonExtension());
	}
};

export default plugin;
