// utils/mfd/pages/sciencePage.js
// Science MFD page - placeholder

class SciencePage {
    static init(mfd) {
        const defaultState = {
            mode: 'overview'
        };

        mfd.setPageState(defaultState, 'science');
        console.log('Science page initialized');
    }

    static getSoftKeys(mfd) {
        // 15 button layout: L1-L5, C1-C5, R1-R5
        return {
            labels: Array(15).fill(''),
            actions: Array(15).fill(null)
        };
    }

    static handleKeyboardInput(mfd, data) {
        console.log('Science page received keyboard input:', data);
    }
}

export default SciencePage;
